"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../node_modules/.pnpm/electron@38.8.6/node_modules/electron/index.js
var require_electron = __commonJS({
  "../../node_modules/.pnpm/electron@38.8.6/node_modules/electron/index.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var pathFile = path.join(__dirname, "path.txt");
    function getElectronPath() {
      let executablePath;
      if (fs.existsSync(pathFile)) {
        executablePath = fs.readFileSync(pathFile, "utf-8");
      }
      if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
        return path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || "electron");
      }
      if (executablePath) {
        return path.join(__dirname, "dist", executablePath);
      } else {
        throw new Error("Electron failed to install correctly, please delete node_modules/electron and try installing again");
      }
    }
    module2.exports = getElectronPath();
  }
});

// preload.ts
var import_electron = __toESM(require_electron());
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
