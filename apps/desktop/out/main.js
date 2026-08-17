"use strict";

// src/main.ts
var import_electron4 = require("electron");
var import_node_path2 = require("node:path");
var import_node_url = require("node:url");

// src/lifecycle.ts
var DESKTOP_SHUTDOWN_TIMEOUT_MS = 5e3;
async function disposeDesktopShell(resources) {
  resources.pump?.dispose();
  try {
    await resources.host?.dispose();
  } finally {
    resources.native?.dispose();
  }
}
function createDesktopShutdown(dispose, exit, timeoutMs = DESKTOP_SHUTDOWN_TIMEOUT_MS) {
  let pending;
  let exited = false;
  const exitOnce = (code) => {
    if (exited) return;
    exited = true;
    exit(code);
  };
  return {
    request(code) {
      if (pending !== void 0) {
        exitOnce(code);
        return pending;
      }
      pending = new Promise((resolve) => {
        const timeout = setTimeout(() => {
          exitOnce(code === 0 ? 1 : code);
          resolve();
        }, timeoutMs);
        void dispose().then(
          () => {
            clearTimeout(timeout);
            exitOnce(code);
            resolve();
          },
          () => {
            clearTimeout(timeout);
            exitOnce(code === 0 ? 1 : code);
            resolve();
          }
        );
      });
      return pending;
    },
    isPending: () => pending !== void 0
  };
}
function installShutdownRequests(signals, nativeApp, requestQuit) {
  const onInterrupt = () => {
    requestQuit(130);
  };
  const onTerminate = () => {
    requestQuit(0);
  };
  const onBeforeQuit = (event) => {
    event.preventDefault();
    requestQuit(0);
  };
  signals.on("SIGINT", onInterrupt);
  signals.on("SIGTERM", onTerminate);
  nativeApp.on("before-quit", onBeforeQuit);
  return () => {
    signals.off("SIGINT", onInterrupt);
    signals.off("SIGTERM", onTerminate);
    nativeApp.off("before-quit", onBeforeQuit);
  };
}

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

// src/tray.ts
var import_electron2 = require("electron");
var TEMPLATE_TRAY_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAACWUlEQVRYhe2WTYiOURTHf2aYD2SkqclqfCxI+YoaseC1GGJnDAslUxZY2JBioaRZsDArkZ1pWOhNpiZEahYijK9iZjOrSTGmhhjSGEa3/q+O233mPo/Xu/L+69TznHu+7rn3nHugjDJKg3lA7l8anAvU6nsOsA/oBgaBx8AsT/4I0F+Mw2XABRn5AUyKRoBv5t9RU0D/utYuAw0JPppCWaoCOoCfnpOpaG3A+C2z/hFYJ/4CYAtwAvgCnLZKlUBPBscFGga2egGc92QeAFcDuq1W6cxfOC/Qd6DN2NqUQucDMLOgsAQYLyKASR3bYRPElYj8Xrv7ziKd2yAOmPvUFZBxd2KPdT4dGNXiENAHvCsyiFOyu9PwnwAtwGz/xq6WQK/HXwgcAl5FHE4AD1Wilv9amyn8u4sZxDYJ3E8SAHYDbxMC6FeZuQZ1Y4pAjycZ3yUBl/ZYe+0NGP6sO7QDqAFeJATgl+pv5IzQ4kgQ1Qm7/ATsl8yaQCMbV4aCWGQEjxKH6/vPAkE8BeYrU2+8tXsxo0PmPCtSBNGocgpVwESA/0fZhXDJCLs7kQZtKcvSvZgzYsaWm3Nz6atLGUR3ip7gHp9UyBvFm2okfpAngXrDqw+ct6VzZECD1wHzZghxWCX+e2C74W/Q0+o7vxPYRBQ54Ksx8hxYadYfmdR2qCxRmv1BxfWMZmBa1iA2A2PeObqx67aeXevkpTppjfSGA5kYUGlmwlKvj6chN7qdVS/JK1t3gXYNO5lRBRxUGcWcu3dkIyVCJbAeOKYh85roogaQFaVyXMb/gV/dRWbOp9K5uAAAAABJRU5ErkJggg==";
var BLUE_TRAY_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAADSUlEQVRYhe1WXYhMcRS/rG9Cm9q21Fpz/jOasogiHlgPiDcMD2Tdc8aE4oUUDzbJAw88ibwRHiRRQqQ8iKzv8lHaUqKde860Nl/Jx16dOx935s7dmdlln+ypf839z/+c8/ufc37n/C1rSIZkECROPfURlNZ/ZrCp7ePkqYl3Y/U3bMhMNOhsNsRXDEonIHe0bOwaX3zekOwC5FcDdgh2Jm6IT6gRg/zbkLi6AEUMyvf8t7fszPwyfeJL3nni082UbgjzoXplUYon3FGG5Jgh7i1xUmHFUOaVGUe5XjiD3APJzALdj7V1TYskneUGeZ9B+QokB32thFsHJFdrdew7ECdCzorSFPDx0nN8D1DOB3WBOFGEmg/323khNfwTyLHztiIkS6rr8cfG1IdxnkIMJQbIPwYKIGew1xDvLLrQuYrn7cym4pCd+TvnPghA2erXE58tTxn3AMqGgvPF7e4Ig9ydM/DOoDwyKOm/igTKAbULSWdtUb4fAjpr4tudCaWUQZ6TO3SneD+a7GoGlO0G+UUVh78M8n2PoqX7L73L+N/Hw+hoGeKV2UKSu6EHFAzxekPS1UcBvlKaZRsUX+4baGZvqPGIzetydEr3BcDLKfXUa5TKAcjnbA1lVje1vR0DJM/CAASp6gNAaS0YSzmRSiBgx5vRYbcE4k9R4qRnLylzg41MGaYRCk+BnZ7uV6jstqqI9n1D8iTklo9npLhRIwXE7wMAblc0arT6c/m02t3h1UBMw+4mpVMfveBXSJp82oUJkJwq5MrmddUAZHUcuyZaonTOTbkjKxqLbU7PzOdNwzc91T2pFhDeSK7SE3T41GLLMiQX/aKSa9pIgiCBeH809WFKfk9/B/MduP1Rq1ZppnRDoANezD9CPIBJZ3Zunw3yqgIIchbpaA1puTeDl6gqkSwlvxUVz1NjO7Py/wPyA7/Y5JjS0tPzZnzgoUJyBzCzzLLcYf0CEU3KUiD5UjpguMOg3NCxG6ju59pJtQGpnr4NQjrla6Vm/0CkZEZpH6+l2vk3EB/RXqLp02gB8S0gOaSPHau/Ek+4o4Bkm9KomnOdI2DzYmtQJOHWRbY4C4Fkjz4yDckFXYB8Uh8gUUq3DI7jIflf5A8E1QULjH3uGwAAAABJRU5ErkJggg==";
var electronTrayNative = {
  nativeImage: { createFromDataURL: (dataUrl) => import_electron2.nativeImage.createFromDataURL(dataUrl) },
  menu: {
    buildFromTemplate: (template) => import_electron2.Menu.buildFromTemplate(template)
  },
  createTray: (image) => new import_electron2.Tray(image)
};
function createDesktopTray(native, platform, show, requestQuit) {
  const macOS = platform === "darwin";
  const source = macOS ? TEMPLATE_TRAY_ICON : BLUE_TRAY_ICON;
  const size = macOS ? 18 : 20;
  const image = native.nativeImage.createFromDataURL(source).resize({ width: size, height: size });
  if (macOS) image.setTemplateImage(true);
  if (image.isEmpty()) throw new Error("desktop tray icon is empty");
  const template = [
    { label: "Show DeepSeek Harness", click: show },
    { type: "separator" },
    { label: "Quit", click: () => {
      requestQuit(0);
    } }
  ];
  const tray = native.createTray(image);
  tray.setToolTip("DeepSeek Harness");
  tray.setContextMenu(native.menu.buildFromTemplate(template));
  tray.on("double-click", show);
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      tray.off("double-click", show);
      tray.destroy();
    }
  };
}

// src/window.ts
var import_electron3 = require("electron");
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
  const window = new import_electron3.BrowserWindow({
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
    (externalUrl) => import_electron3.shell.openExternal(externalUrl),
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
var state = {};
function ipcFace() {
  return {
    handle: (channel, listener) => {
      import_electron4.ipcMain.handle(channel, (_event, raw) => listener(raw));
    },
    removeHandler: (channel) => {
      import_electron4.ipcMain.removeHandler(channel);
    }
  };
}
if (!import_electron4.app.requestSingleInstanceLock()) {
  import_electron4.app.exit(0);
} else {
  let disposeNativeListeners = () => {
  };
  const shutdown = createDesktopShutdown(
    () => disposeDesktopShell({
      pump: state.pump,
      host: state.host,
      native: {
        dispose: () => {
          disposeNativeListeners();
          state.tray?.dispose();
          state.window?.dispose();
        }
      }
    }),
    (code) => {
      import_electron4.app.exit(code);
    }
  );
  const onSecondInstance = () => {
    state.window?.show();
  };
  const onActivate = () => {
    state.window?.show();
  };
  const onUnhandledRejection = (reason) => {
    reportFailure("Unexpected failure", reason, shutdown);
  };
  const disposeShutdownRequests = installShutdownRequests(
    process,
    import_electron4.app,
    (code) => {
      void shutdown.request(code);
    }
  );
  import_electron4.app.on("second-instance", onSecondInstance);
  import_electron4.app.on("activate", onActivate);
  process.on("unhandledRejection", onUnhandledRejection);
  disposeNativeListeners = () => {
    disposeShutdownRequests();
    import_electron4.app.off("second-instance", onSecondInstance);
    import_electron4.app.off("activate", onActivate);
    process.off("unhandledRejection", onUnhandledRejection);
  };
  try {
    registerDshScheme();
    void import_electron4.app.whenReady().then(() => {
      return bootPrimaryInstance(shutdown);
    }).catch((error) => {
      reportFailure("Unexpected failure", error, shutdown);
    });
  } catch (error) {
    reportFailure("Startup failure", error, shutdown);
  }
}
async function bootPrimaryInstance(shutdown) {
  const resourcesDir = import_electron4.app.isPackaged ? process.resourcesPath : (0, import_node_path2.join)(import_electron4.app.getAppPath(), "resources");
  const window = createMainWindow(
    resourcesDir,
    () => shutdown.isPending(),
    reportExternalOpenError
  );
  state.window = window;
  state.tray = createDesktopTray(
    electronTrayNative,
    process.platform,
    () => {
      state.window?.show();
    },
    (code) => {
      void shutdown.request(code);
    }
  );
  const hostBootPath = import_electron4.app.isPackaged ? (0, import_node_path2.join)(process.resourcesPath, "host", "node_modules", "@deepseek-ai", "dsh-desktop-app", "lib", "host-boot.js") : (0, import_node_path2.join)(import_electron4.app.getAppPath(), "node_modules", "@deepseek-ai", "dsh-desktop-app", "lib", "host-boot.js");
  const { bootDesktopHost } = await import((0, import_node_url.pathToFileURL)(hostBootPath).href);
  let host;
  try {
    host = await bootDesktopHost({
      frontendIndexPath: (0, import_node_path2.join)(resourcesDir, "frontend", "index.html"),
      requestExit: (code) => {
        void shutdown.request(code);
      }
    });
  } catch (error) {
    reportFailure("Startup failure", error, shutdown);
    return;
  }
  state.host = host;
  mountDshProtocol(host.runtime);
  state.pump = mountFetchPump(ipcFace(), window.window.webContents, host.runtime.fetch);
  await window.window.loadURL("dsh://app/");
}
function reportFailure(title, error, shutdown) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  import_electron4.dialog.showErrorBox("DeepSeek Harness", `${title}:
${message}`);
  process.stderr.write(`[desktop] ${title}: ${message}
`);
  void shutdown.request(1);
}
function reportExternalOpenError(error) {
  import_electron4.dialog.showErrorBox("DeepSeek Harness", `Unable to open external link:
${String(error)}`);
}
//# sourceMappingURL=main.js.map
