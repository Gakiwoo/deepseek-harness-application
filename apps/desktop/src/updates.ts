/** Desktop updates capability: GitHub Releases feed check, checksummed download, and clean-exit apply. */

import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { compare, valid } from 'semver'

/** GitHub repository publishing DeepSeek Harness desktop releases. */
export const UPDATE_RELEASE_REPOSITORY = 'Gakiwoo/deepseek-harness-application'

/** Suffix of the checksum sidecar a release must carry next to each artifact. */
export const UPDATE_CHECKSUM_SUFFIX = '.sha256'

/** Exit-code budget for applying a staged update during shutdown (a bundle swap is slow). */
export const UPDATE_APPLY_TIMEOUT_MS = 120_000

/** Raised when the release feed cannot satisfy an update request. */
export class DesktopUpdateError extends Error {
  /** Stable machine-readable failure code. */
  readonly code: 'feed' | 'checksum' | 'artifact' | 'download' | 'stage' | 'apply'

  /** Creates the typed failure. */
  constructor(code: DesktopUpdateError['code'], message: string) {
    super(message)
    this.name = 'DesktopUpdateError'
    this.code = code
  }
}

/** One release returned by the GitHub Releases feed. */
export interface DesktopUpdateRelease {
  /** Release tag, with or without a leading v. */
  readonly tagName: string

  /** Release publication timestamp. */
  readonly publishedAt: string

  /** Whether GitHub marks the release as a prerelease. */
  readonly prerelease: boolean

  /** Assets attached to the release. */
  readonly assets: DesktopUpdateAsset[]
}

/** One downloadable asset of a release. */
export interface DesktopUpdateAsset {
  /** File name, used for artifact and checksum matching. */
  readonly name: string

  /** Direct download URL. */
  readonly url: string

  /** Content length in bytes. */
  readonly size: number
}

/** Installer kind of a matched platform artifact. */
export type DesktopUpdateKind = 'zip' | 'dmg' | 'exe'

/** A matched artifact together with the URL of its checksum sidecar. */
export interface DesktopUpdateArtifact {
  /** Artifact file name. */
  readonly name: string

  /** Direct download URL. */
  readonly url: string

  /** Content length in bytes. */
  readonly size: number

  /** Installer kind, chosen from the electron-builder targets. */
  readonly kind: DesktopUpdateKind

  /** URL of the `name.sha256` sidecar carrying the expected digest. */
  readonly checksumUrl: string
}

/** One installable update selected from the feed. */
export interface DesktopUpdateInfo {
  /** Target version without a leading v. */
  readonly version: string

  /** Human-readable release name. */
  readonly releaseName: string

  /** Release publication timestamp. */
  readonly publishedAt: string

  /** The artifact to download and apply. */
  readonly artifact: DesktopUpdateArtifact
}

/** Download byte progress. */
export interface DesktopUpdateProgress {
  /** Bytes received so far. */
  readonly received: number

  /** Total artifact size in bytes. */
  readonly total: number
}

/** Native operations the updates capability needs injected. */
export interface DesktopUpdateNative {
  /** Network client used for the feed and artifact downloads; URLs are always strings. */
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>

  /** Process spawner used for extraction, copying, and detached installers. */
  readonly spawn: (
    command: string,
    args: string[],
    options?: { detached?: boolean; stdio?: 'ignore' },
  ) => {
    on(event: 'exit', listener: (code: number) => void): unknown
    unref(): void
  }

  /** Process environment, read for repository overrides. */
  readonly env: Record<string, string | undefined>

  /** Reads the bundle version of a staged macOS app for verification. */
  readonly plistBundleVersion: (appPath: string) => string
}

/** Owned updates capability over one desktop install. */
export interface DesktopUpdateHandle {
  /**
   * Finds the newest channel-eligible release newer than the running version.
   * @returns The installable update, or undefined when up to date.
   */
  check(): Promise<DesktopUpdateInfo | undefined>

  /**
   * Streams the update artifact with sha256 verification.
   * @param info The selected update.
   * @param onProgress Progress callback during the download.
   * @returns The verified artifact path under the updates directory.
   */
  download(info: DesktopUpdateInfo, onProgress?: (progress: DesktopUpdateProgress) => void): Promise<string>

  /**
   * Makes a downloaded artifact ready for clean-exit apply.
   * @param info The selected update.
   * @param artifactPath Path of the verified artifact.
   */
  stage(info: DesktopUpdateInfo, artifactPath: string): Promise<void>

  /** @returns The update staged for apply, or undefined when none is pending. */
  pendingUpdate(): DesktopUpdateInfo | undefined

  /**
   * Applies the staged update; the running process is expected to exit afterwards.
   * @throws When apply fails; the pending marker survives so the next clean exit retries.
   */
  applyPending(): Promise<void>

  /** Removes the pending marker and the extracted bundle, keeping the downloaded artifact. */
  cancelPending(): void
}

/** Checksum sidecar content, `hex  filename` as produced by `shasum`. */
const CHECKSUM_PATTERN = /^([0-9a-f]{64})/m

/** GitHub API pagination for the releases feed. */
const RELEASES_PER_PAGE = 5

/**
 * Reads the sha256 digest from a checksum sidecar.
 * @param content Sidecar file content.
 * @returns The 64-hex digest.
 */
export function parseChecksum(content: string): string {
  const match = content.match(CHECKSUM_PATTERN)
  if (match === null) {
    throw new DesktopUpdateError('checksum', 'checksum asset does not contain a sha256 digest')
  }
  return match[1]
}

/**
 * Extracts the version from a release tag.
 * @param tagName Release tag.
 * @returns The semver version, or undefined when the tag is not a version.
 */
export function versionFromTag(tagName: string): string | undefined {
  const version = valid(tagName.replace(/^v/, ''))
  return version ?? undefined
}

/**
 * Matches the platform installer artifact and its checksum sidecar.
 * @param release The release to match against.
 * @param platform Current Node.js platform.
 * @param arch Current Node.js architecture.
 * @returns The matched artifact, or undefined when the release has none for this platform.
 */
export function matchArtifact(
  release: DesktopUpdateRelease,
  platform: NodeJS.Platform,
  arch: string,
): DesktopUpdateArtifact | undefined {
  const candidates = release.assets.filter((asset) => {
    if (platform === 'darwin') {
      return /^DeepSeek-Harness-.*-mac-(arm64|x64)\.(zip|dmg)$/.test(asset.name)
        && asset.name.includes(`-mac-${arch}`)
    }
    if (platform === 'win32') {
      return /^DeepSeek-Harness-.*-win-x64\.exe$/.test(asset.name)
    }
    return false
  })
  if (candidates.length === 0) return undefined

  const preferred = candidates.find(asset => asset.name.endsWith(platform === 'win32' ? '.exe' : '.zip'))
  const artifact = preferred ?? candidates[0]
  const checksum = release.assets.find(asset => asset.name === `${artifact.name}${UPDATE_CHECKSUM_SUFFIX}`)
  if (checksum === undefined) {
    throw new DesktopUpdateError(
      'checksum',
      `release ${release.tagName} carries ${artifact.name} without its ${UPDATE_CHECKSUM_SUFFIX} sidecar`,
    )
  }

  const kind: DesktopUpdateKind = artifact.name.endsWith('.dmg') ? 'dmg' : artifact.name.endsWith('.exe') ? 'exe' : 'zip'
  return {
    name: artifact.name,
    url: artifact.url,
    size: artifact.size,
    kind,
    checksumUrl: checksum.url,
  }
}

/**
 * Fetches the release feed for the configured repository.
 * @param native Injected natives.
 * @param repository `owner/repo` pair publishing releases.
 * @returns Releases, newest first.
 */
export async function fetchReleases(
  native: DesktopUpdateNative,
  repository: string,
): Promise<DesktopUpdateRelease[]> {
  const endpoint = `https://api.github.com/repos/${repository}/releases?per_page=${RELEASES_PER_PAGE}`
  const response = await native.fetch(endpoint, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'DeepSeek-Harness-Desktop',
    },
  })
  if (!response.ok) {
    throw new DesktopUpdateError('feed', `release feed responded ${response.status} for ${repository}`)
  }
  const releases = await response.json() as Array<{
    tag_name: string
    published_at: string
    prerelease: boolean
    assets: Array<{ name: string; browser_download_url: string; size: number }>
  }>
  return releases.map(release => ({
    tagName: release.tag_name,
    publishedAt: release.published_at,
    prerelease: release.prerelease,
    assets: release.assets.map(asset => ({
      name: asset.name,
      url: asset.browser_download_url,
      size: asset.size,
    })),
  }))
}

/**
 * Selects the newest channel-eligible update for this platform.
 * @param releases Feed releases, newest first.
 * @param platform Current Node.js platform.
 * @param arch Current Node.js architecture.
 * @param currentVersion Running application version.
 * @returns The installable update, or undefined when up to date.
 */
export function selectUpdate(
  releases: DesktopUpdateRelease[],
  platform: NodeJS.Platform,
  arch: string,
  currentVersion: string,
): DesktopUpdateInfo | undefined {
  if (platform !== 'darwin' && platform !== 'win32') {
    throw new DesktopUpdateError('artifact', `desktop updates are not offered on ${platform}`)
  }

  const currentIsPrerelease = currentVersion.includes('-')
  const eligible = releases.filter((release) => {
    const version = versionFromTag(release.tagName)
    if (version === undefined) return false
    if (version === currentVersion) return false
    if (!currentIsPrerelease && release.prerelease) return false
    return compare(version, currentVersion) > 0
  })
  if (eligible.length === 0) return undefined

  const newest = eligible.reduce((best, release) => {
    const bestVersion = versionFromTag(best.tagName) as string
    const version = versionFromTag(release.tagName) as string
    return compare(version, bestVersion) > 0 ? release : best
  })
  const version = versionFromTag(newest.tagName) as string
  const artifact = matchArtifact(newest, platform, arch)
  if (artifact === undefined) {
    throw new DesktopUpdateError(
      'artifact',
      `release ${newest.tagName} ships no ${platform} artifact for this build`,
    )
  }
  return {
    version,
    releaseName: newest.tagName,
    publishedAt: newest.publishedAt,
    artifact,
  }
}

/**
 * Streams an artifact to the updates directory with sha256 verification.
 * @param native Injected natives.
 * @param info The selected update.
 * @param directory Directory staging downloaded artifacts.
 * @param onProgress Progress callback during the download.
 * @returns The verified artifact path.
 */
export async function downloadUpdate(
  native: DesktopUpdateNative,
  info: DesktopUpdateInfo,
  directory: string,
  onProgress?: (progress: DesktopUpdateProgress) => void,
): Promise<string> {
  mkdirSync(directory, { recursive: true })
  const targetPath = join(directory, info.artifact.name)
  const partPath = join(directory, `${info.artifact.name}.part`)

  const checksumResponse = await native.fetch(info.artifact.checksumUrl, {
    headers: { 'User-Agent': 'DeepSeek-Harness-Desktop' },
  })
  if (!checksumResponse.ok) {
    throw new DesktopUpdateError('checksum', `checksum sidecar responded ${checksumResponse.status}`)
  }
  const expected = parseChecksum(await checksumResponse.text())

  const response = await native.fetch(info.artifact.url, {
    headers: { 'User-Agent': 'DeepSeek-Harness-Desktop' },
  })
  if (!response.ok) {
    throw new DesktopUpdateError('download', `artifact download responded ${response.status}`)
  }
  if (response.body === null) {
    throw new DesktopUpdateError('download', `artifact download for ${info.artifact.name} has no body`)
  }

  const hash = createHash('sha256')
  const total = info.artifact.size
  let received = 0
  const writeStream = createWriteStream(partPath)
  try {
    for await (const chunk of response.body) {
      const bytes = chunk as Uint8Array
      hash.update(bytes)
      received += bytes.byteLength
      writeStream.write(bytes)
      onProgress?.({ received, total })
    }
    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => { resolve() })
      writeStream.on('error', reject)
    })
  } catch (error) {
    rmSync(partPath, { force: true })
    if (error instanceof DesktopUpdateError) throw error
    throw new DesktopUpdateError('download', `artifact download for ${info.artifact.name} failed: ${String(error)}`)
  }

  const digest = hash.digest('hex')
  if (digest !== expected) {
    rmSync(partPath, { force: true })
    throw new DesktopUpdateError(
      'checksum',
      `artifact ${info.artifact.name} sha256 ${digest} does not match the release ${expected}`,
    )
  }

  renameSync(partPath, targetPath)
  return targetPath
}

/**
 * Plans the clean-exit apply for a staged artifact.
 * @param info The selected update.
 * @param platform Current Node.js platform.
 * @returns The apply plan.
 */
export function planApply(info: DesktopUpdateInfo, platform: NodeJS.Platform): 'swap' | 'silent-install' | 'unsupported' {
  if (platform === 'darwin') {
    return info.artifact.kind === 'zip' ? 'swap' : 'unsupported'
  }
  if (platform === 'win32' && info.artifact.kind === 'exe') {
    return 'silent-install'
  }
  return 'unsupported'
}

/**
 * Creates the owned updates capability.
 * @param native Injected natives.
 * @param options Runtime identity of the install.
 * @returns The updates handle.
 */
export function createDesktopUpdater(
  native: DesktopUpdateNative,
  options: {
    enabled: boolean
    platform: NodeJS.Platform
    arch: string
    currentVersion: string
    currentAppPath: string
    userDataDir: string
  },
): DesktopUpdateHandle {
  const updatesDir = join(options.userDataDir, 'updates')
  const markerPath = join(updatesDir, 'pending.json')
  const repository = native.env.DSH_DESKTOP_UPDATE_REPOSITORY ?? UPDATE_RELEASE_REPOSITORY

  function readMarker(): DesktopUpdateInfo | undefined {
    if (!existsSync(markerPath)) return undefined
    try {
      const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as DesktopUpdateInfo & {
        action: string
        stagedAppPath?: string
      }
      return {
        version: marker.version,
        releaseName: marker.releaseName,
        publishedAt: marker.publishedAt,
        artifact: marker.artifact,
      }
    } catch {
      return undefined
    }
  }

  return {
    async check() {
      if (!options.enabled) {
        throw new DesktopUpdateError('feed', 'desktop updates are disabled on this install')
      }
      const releases = await fetchReleases(native, repository)
      return selectUpdate(releases, options.platform, options.arch, options.currentVersion)
    },

    async download(info, onProgress) {
      return downloadUpdate(native, info, updatesDir, onProgress)
    },

    async stage(info, artifactPath) {
      mkdirSync(updatesDir, { recursive: true })
      const action = planApply(info, options.platform)
      if (action === 'unsupported') {
        throw new DesktopUpdateError('apply', `no clean-exit apply exists for ${info.artifact.kind} on ${options.platform}`)
      }

      let stagedAppPath: string | undefined
      if (action === 'swap') {
        const extractDir = join(updatesDir, `extracted-${info.version}`)
        rmSync(extractDir, { recursive: true, force: true })
        mkdirSync(extractDir, { recursive: true })
        const exitCode = await new Promise<number>((resolve) => {
          const child = native.spawn('ditto', ['-x', '-k', artifactPath, extractDir])
          child.on('exit', (code) => { resolve(code) })
        })
        if (exitCode !== 0) {
          throw new DesktopUpdateError('stage', `bundle extraction failed with exit ${exitCode}`)
        }
        const appName = readdirApps(extractDir)
        if (appName === undefined) {
          throw new DesktopUpdateError('stage', `extraction of ${info.artifact.name} produced no .app bundle`)
        }
        const stagedBundlePath = join(extractDir, appName)
        const bundleVersion = native.plistBundleVersion(stagedBundlePath)
        if (bundleVersion !== info.version) {
          throw new DesktopUpdateError(
            'stage',
            `staged bundle version ${bundleVersion} does not match release ${info.version}`,
          )
        }
        // ditto preserves the download's quarantine attribute; an updated app
        // left quarantined is Gatekeeper-blocked on first launch.
        const quarantineExit = await new Promise<number>((resolve) => {
          const child = native.spawn('xattr', ['-dr', 'com.apple.quarantine', stagedBundlePath])
          child.on('exit', (code) => { resolve(code) })
        })
        if (quarantineExit !== 0) {
          throw new DesktopUpdateError('stage', `quarantine removal failed with exit ${quarantineExit}`)
        }
        stagedAppPath = stagedBundlePath
      }

      writeFileSync(markerPath, JSON.stringify({
        version: info.version,
        releaseName: info.releaseName,
        publishedAt: info.publishedAt,
        artifact: info.artifact,
        action,
        stagedAppPath,
      }, null, 2))
    },

    pendingUpdate: readMarker,

    async applyPending() {
      const marker = readMarker()
      if (marker === undefined) return
      if (!options.enabled) {
        throw new DesktopUpdateError('apply', 'desktop updates are disabled on this install')
      }
      const action = planApply(marker, options.platform)
      if (action === 'silent-install') {
        native.spawn(join(updatesDir, marker.artifact.name), ['/S'], {
          detached: true,
          stdio: 'ignore',
        }).unref()
        rmSync(markerPath, { force: true })
        return
      }
      if (action === 'swap') {
        await applySwap(marker, updatesDir, markerPath, options.currentAppPath, native)
        return
      }
      throw new DesktopUpdateError('apply', `no clean-exit apply exists for ${marker.artifact.kind} on ${options.platform}`)
    },

    cancelPending() {
      const marker = readMarker()
      if (marker !== undefined && marker.artifact.kind === 'zip') {
        rmSync(join(updatesDir, `extracted-${marker.version}`), { recursive: true, force: true })
      }
      rmSync(markerPath, { force: true })
    },
  }
}

/**
 * Lists the single .app bundle inside an extraction directory.
 * @param directory Extraction directory.
 * @returns The bundle name, or undefined when none is present.
 */
function readdirApps(directory: string): string | undefined {
  return readdirSync(directory).find(entry => entry.endsWith('.app'))
}

/**
 * Replaces the running macOS bundle with the staged one.
 * @param marker The pending marker.
 * @param updatesDir Directory staging pending updates.
 * @param markerPath Marker file path.
 * @param currentAppPath Running bundle path.
 * @param native Injected natives.
 */
async function applySwap(
  marker: DesktopUpdateInfo,
  updatesDir: string,
  markerPath: string,
  currentAppPath: string,
  native: DesktopUpdateNative,
): Promise<void> {
  if (marker.artifact.kind !== 'zip') {
    throw new DesktopUpdateError('apply', `swap requires a zip artifact, got ${marker.artifact.kind}`)
  }
  const stagedAppPath = markerStagedAppPath(marker, updatesDir)
  const destDir = dirname(currentAppPath)
  const destName = basename(currentAppPath)
  const stagedCopy = join(destDir, `.harness-staged-${marker.version}`)
  const oldPath = join(destDir, `${destName}.old`)

  await copyTree(native, stagedAppPath, stagedCopy)
  try {
    rmSync(oldPath, { recursive: true, force: true })
    renameSync(currentAppPath, oldPath)
    renameSync(stagedCopy, currentAppPath)
  } catch (error) {
    // Best-effort restore of the running bundle before failing the quit; the
    // cleanup must never mask the swap failure that triggered it.
    try {
      renameSync(oldPath, currentAppPath)
    } catch {
      // The old bundle may still sit at its own path; nothing else can be done.
    }
    try {
      rmSync(stagedCopy, { recursive: true, force: true })
    } catch {
      // A read-only destination can block removal; the next launch retries.
    }
    throw new DesktopUpdateError('apply', `bundle swap failed: ${String(error)}`)
  }
  rmSync(oldPath, { recursive: true, force: true })
  rmSync(join(updatesDir, `extracted-${marker.version}`), { recursive: true, force: true })
  rmSync(markerPath, { force: true })
}

/**
 * Resolves the staged bundle path recorded for a zip update.
 * @param marker The pending marker.
 * @param updatesDir Directory staging pending updates.
 * @returns The staged bundle path.
 */
function markerStagedAppPath(marker: DesktopUpdateInfo, updatesDir: string): string {
  if (marker.artifact.kind !== 'zip') {
    throw new DesktopUpdateError('apply', `swap requires a zip artifact, got ${marker.artifact.kind}`)
  }
  const extractDir = join(updatesDir, `extracted-${marker.version}`)
  const appName = readdirApps(extractDir)
  if (appName === undefined) {
    throw new DesktopUpdateError('apply', `staged extraction ${extractDir} has no .app bundle`)
  }
  return join(extractDir, appName)
}

/**
 * Copies a bundle tree, preserving permissions and attributes.
 * @param native Injected natives.
 * @param source Source bundle path.
 * @param destination Destination bundle path.
 */
async function copyTree(native: DesktopUpdateNative, source: string, destination: string): Promise<void> {
  const exitCode = await new Promise<number>((resolve) => {
    const child = native.spawn('ditto', [source, destination])
    child.on('exit', (code) => { resolve(code) })
  })
  if (exitCode !== 0) {
    throw new DesktopUpdateError('apply', `bundle copy failed with exit ${exitCode}`)
  }
}
