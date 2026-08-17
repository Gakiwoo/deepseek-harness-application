"use strict";

// src/main.ts
var import_electron3 = require("electron");
var import_node_path2 = require("node:path");
var import_node_url = require("node:url");

// src/protocol.ts
var import_node_fs = require("node:fs");
var import_electron = require("electron");

// ../../packages/client/modules/lib/index.js
function injectBootManifest(html, graph) {
  const script = `<script>window.__DSH_BOOT__ = ${JSON.stringify(graph).replaceAll("<", "\\u003c")}</script>`;
  const head = html.indexOf("<head>");
  if (head !== -1) return `${html.slice(0, head + 6)}${script}${html.slice(head + 6)}`;
  return `${script}${html}`;
}

// src/protocol.ts
var CSP = "default-src 'self'; script-src 'self'; connect-src 'self'";
function registerDshScheme() {
  import_electron.protocol.registerSchemesAsPrivileged([{
    scheme: "dsh",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }]);
}
function mountDshProtocol(runtime) {
  import_electron.protocol.handle("dsh", (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (path === "/" || path === "/index.html") {
      const html = (0, import_node_fs.readFileSync)(runtime.frontendIndex(), "utf8");
      return new Response(injectBootManifest(html, runtime.graph()), {
        headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP }
      });
    }
    const pluginsPrefix = "/plugins/";
    if (path.startsWith(pluginsPrefix) && path.endsWith("/client.js")) {
      const id = path.slice(pluginsPrefix.length, -"/client.js".length);
      const clientPath = runtime.clientPath(id);
      if (clientPath === void 0) return new Response("not found", { status: 404 });
      return import_electron.net.fetch(`file://${clientPath}`);
    }
    const dir = runtime.frontendIndex().slice(0, runtime.frontendIndex().lastIndexOf("/"));
    return import_electron.net.fetch(`file://${dir}${path}`);
  });
}

// src/window.ts
var import_electron2 = require("electron");
var import_node_path = require("node:path");
var EXTERNAL_PROTOCOLS = /* @__PURE__ */ new Set(["http:", "https:", "mailto:"]);
function showDesktopWindow(window) {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
function handleDesktopWindowClose(window, event, quitting) {
  if (quitting) return;
  event.preventDefault();
  if (!window.isDestroyed()) window.hide();
}
function isDesktopNavigation(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "dsh:" && url.hostname === "app";
  } catch {
    return false;
  }
}
function handleDesktopWindowOpen(raw, openExternal, report) {
  try {
    if (!EXTERNAL_PROTOCOLS.has(new URL(raw).protocol)) return { action: "deny" };
    void openExternal(raw).catch(report);
  } catch (error) {
    if (error instanceof TypeError) return { action: "deny" };
    report(error);
  }
  return { action: "deny" };
}
function createMainWindow(resourcesDir, isQuitting, reportExternalOpenError2) {
  const window = new import_electron2.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: "#1e1e1e",
    title: "DeepSeek Harness",
    webPreferences: {
      preload: (0, import_node_path.join)(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const onReady = () => {
    showDesktopWindow(window);
  };
  const onClose = (event) => {
    handleDesktopWindowClose(window, event, isQuitting());
  };
  const onFrameNavigate = (event) => {
    if (event.isMainFrame && !isDesktopNavigation(event.url)) event.preventDefault();
  };
  const onRedirect = (event) => {
    if (event.isMainFrame && !isDesktopNavigation(event.url)) event.preventDefault();
  };
  void window.loadFile((0, import_node_path.join)(resourcesDir, "splash.html"));
  window.once("ready-to-show", onReady);
  window.on("close", onClose);
  window.webContents.on("will-frame-navigate", onFrameNavigate);
  window.webContents.on("will-redirect", onRedirect);
  window.webContents.setWindowOpenHandler(({ url }) => handleDesktopWindowOpen(
    url,
    (externalUrl) => import_electron2.shell.openExternal(externalUrl),
    reportExternalOpenError2
  ));
  let disposed = false;
  return {
    window,
    show: () => {
      showDesktopWindow(window);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.off("ready-to-show", onReady);
      window.off("close", onClose);
      window.webContents.off("will-frame-navigate", onFrameNavigate);
      window.webContents.off("will-redirect", onRedirect);
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      if (!window.isDestroyed()) window.destroy();
    }
  };
}

// ../../packages/client/connection/lib/types/client/desktop-bridge.js
var DSH_FETCH_REQUEST = "dsh-fetch/request";
var DSH_FETCH_RESPONSE = "dsh-fetch/response";
var DSH_FETCH_CHUNK = "dsh-fetch/chunk";
var DSH_FETCH_END = "dsh-fetch/end";
var DSH_FETCH_ERROR = "dsh-fetch/error";
var DSH_FETCH_ABORT = "dsh-fetch/abort";

// src/host-glue/fetch-pump.ts
function parseWireRequest(raw) {
  if (typeof raw !== "object" || raw === null) return void 0;
  const candidate = raw;
  if (typeof candidate.id !== "string" || typeof candidate.url !== "string" || typeof candidate.method !== "string" || typeof candidate.headers !== "object" || candidate.headers === null || candidate.body !== null && typeof candidate.body !== "string") return void 0;
  return raw;
}
function mountFetchPump(ipc, sender, fetch) {
  const aborts = /* @__PURE__ */ new Map();
  ipc.handle(DSH_FETCH_REQUEST, (raw) => {
    const wire = parseWireRequest(raw);
    if (wire === void 0) return { accepted: false };
    const controller = new AbortController();
    aborts.set(wire.id, controller);
    void pumpOne(sender, wire, controller.signal, fetch).finally(() => {
      aborts.delete(wire.id);
    });
    return { accepted: true };
  });
  ipc.handle(DSH_FETCH_ABORT, (raw) => {
    const id = raw?.id;
    if (typeof id === "string") aborts.get(id)?.abort();
    return { accepted: true };
  });
  return {
    dispose() {
      for (const controller of aborts.values()) controller.abort();
      aborts.clear();
      ipc.removeHandler(DSH_FETCH_REQUEST);
      ipc.removeHandler(DSH_FETCH_ABORT);
    }
  };
}
async function pumpOne(sender, wire, signal, fetch) {
  try {
    const parsed = new URL(wire.url);
    const request = new Request(`${parsed.protocol === "dsh:" ? "http" : parsed.protocol.slice(0, -1)}://127.0.0.1${parsed.pathname}${parsed.search}`, {
      method: wire.method,
      headers: wire.headers,
      ...wire.body === null ? {} : { body: wire.body },
      signal
    });
    const response = await fetch(request);
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    sender.send(DSH_FETCH_RESPONSE, { id: wire.id, status: response.status, headers });
    if (response.body === null) {
      sender.send(DSH_FETCH_END, { id: wire.id });
      return;
    }
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== void 0 && value.byteLength > 0) sender.send(DSH_FETCH_CHUNK, { id: wire.id, data: value });
    }
    sender.send(DSH_FETCH_END, { id: wire.id });
  } catch (error) {
    sender.send(DSH_FETCH_ERROR, { id: wire.id, message: error instanceof Error ? error.message : String(error) });
  }
}

// src/main.ts
var state = { quitting: false };
function ipcFace() {
  return {
    handle: (channel, listener) => {
      import_electron3.ipcMain.handle(channel, (_event, raw) => listener(raw));
    },
    removeHandler: (channel) => {
      import_electron3.ipcMain.removeHandler(channel);
    }
  };
}
if (!import_electron3.app.requestSingleInstanceLock()) {
  import_electron3.app.quit();
} else {
  import_electron3.app.on("second-instance", () => {
    state.window?.show();
  });
  registerDshScheme();
  import_electron3.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") import_electron3.app.quit();
  });
  import_electron3.app.on("activate", () => {
    if (state.window === void 0 && state.host !== void 0) void loadReady();
  });
  void import_electron3.app.whenReady().then(main).catch(fatal);
}
async function main() {
  const resourcesDir = import_electron3.app.isPackaged ? process.resourcesPath : (0, import_node_path2.join)(import_electron3.app.getAppPath(), "resources");
  const hostBootPath = import_electron3.app.isPackaged ? (0, import_node_path2.join)(process.resourcesPath, "host", "node_modules", "@deepseek-ai", "dsh-desktop-app", "lib", "host-boot.js") : (0, import_node_path2.join)(import_electron3.app.getAppPath(), "node_modules", "@deepseek-ai", "dsh-desktop-app", "lib", "host-boot.js");
  const { bootDesktopHost } = await import((0, import_node_url.pathToFileURL)(hostBootPath).href);
  state.window = createMainWindow(resourcesDir, () => state.quitting, reportExternalOpenError);
  try {
    state.host = await bootDesktopHost({
      frontendIndexPath: (0, import_node_path2.join)(resourcesDir, "frontend", "index.html"),
      requestExit: (code) => {
        import_electron3.app.exit(code);
      }
    });
  } catch (error) {
    await showError(state.window.window, error);
    import_electron3.app.exit(1);
    return;
  }
  process.on("unhandledRejection", (reason) => {
    import_electron3.dialog.showErrorBox("DeepSeek Harness", `Unexpected failure:
${String(reason)}`);
    import_electron3.app.exit(1);
  });
  mountDshProtocol(state.host.runtime);
  state.pump = mountFetchPump(ipcFace(), state.window.window.webContents, state.host.runtime.fetch);
  import_electron3.app.on("before-quit", (event) => {
    if (state.quitting || state.host === void 0) return;
    state.quitting = true;
    event.preventDefault();
    const host = state.host;
    void Promise.race([host.dispose(), new Promise((resolve) => {
      setTimeout(resolve, 5e3);
    })]).then(() => {
      import_electron3.app.quit();
    });
  });
  await loadReady();
}
async function loadReady() {
  const host = state.host;
  if (host === void 0) throw new Error("desktop: cannot load the renderer before the host is ready");
  const handle = state.window ?? createMainWindow(
    (0, import_node_path2.join)(import_electron3.app.getAppPath(), "resources"),
    () => state.quitting,
    reportExternalOpenError
  );
  state.window = handle;
  state.pump?.dispose();
  state.pump = mountFetchPump(ipcFace(), handle.window.webContents, host.runtime.fetch);
  await handle.window.loadURL("dsh://app/");
}
async function showError(window, error) {
  const message = error instanceof Error ? `${error.message}

${String(error.stack ?? "")}` : String(error);
  await window.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
    `<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;background:#1e1e1e;color:#eee;padding:40px"><h1>\u542F\u52A8\u5931\u8D25 / Startup failure</h1><pre>${message.replaceAll("<", "&lt;")}</pre><p>\u65E5\u5FD7 / Logs: ~/.dsh/logs/</p></body>`
  ));
}
function fatal(error) {
  import_electron3.dialog.showErrorBox("DeepSeek Harness", error instanceof Error ? error.stack ?? error.message : String(error));
  import_electron3.app.exit(1);
}
function reportExternalOpenError(error) {
  import_electron3.dialog.showErrorBox("DeepSeek Harness", `Unable to open external link:
${String(error)}`);
}
//# sourceMappingURL=main.js.map
