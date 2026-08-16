"use strict";

// preload.ts
var import_electron = require("electron");
function bind(channel, listener) {
  const wrapped = (_event, message) => {
    listener(message);
  };
  import_electron.ipcRenderer.on(channel, wrapped);
  return () => {
    import_electron.ipcRenderer.removeListener(channel, wrapped);
  };
}
import_electron.contextBridge.exposeInMainWorld("__DSH_DESKTOP__", {
  request: (message) => import_electron.ipcRenderer.invoke("dsh-fetch/request", message),
  abort: (id) => {
    void import_electron.ipcRenderer.invoke("dsh-fetch/abort", { id });
  },
  onResponse: (listener) => bind("dsh-fetch/response", listener),
  onChunk: (listener) => bind("dsh-fetch/chunk", listener),
  onEnd: (listener) => bind("dsh-fetch/end", listener),
  onError: (listener) => bind("dsh-fetch/error", listener)
});
//# sourceMappingURL=preload.cjs.map
