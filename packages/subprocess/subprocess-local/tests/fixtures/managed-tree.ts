import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [statePath] = process.argv.slice(2)
if (statePath === undefined) throw new Error('usage: managed-tree.ts <state-path>')

process.on('SIGTERM', () => {})
process.on('SIGHUP', () => {})
const descendant = spawn(process.execPath, [
  '-e',
  'process.on("SIGTERM",()=>{});process.on("SIGHUP",()=>{});setInterval(()=>{},60_000)',
], { stdio: 'ignore' })
if (descendant.pid === undefined) throw new Error('managed descendant did not publish a pid')

// Write the state atomically (temp file + rename) so a concurrent reader never
// observes a truncated JSON payload under load.
const temp = join(mkdtempSync(join(tmpdir(), 'dsh-managed-tree-')), 'state.json')
await writeFile(temp, JSON.stringify({ root: process.pid, descendant: descendant.pid }))
await rename(temp, statePath)
setInterval(() => {}, 60_000)
