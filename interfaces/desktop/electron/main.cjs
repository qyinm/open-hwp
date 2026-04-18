const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DEV_RENDERER_URL = "http://127.0.0.1:1420";
const ENGINE_BIN_NAME = process.platform === "win32" ? "openhwp.exe" : "openhwp";

function fileExists(targetPath) {
  if (!targetPath) {
    return false;
  }

  try {
    return fs.statSync(targetPath).isFile();
  } catch {
    return false;
  }
}

function isDevLaunch() {
  return process.argv.includes("--dev");
}

function devEngineBinPath() {
  return path.resolve(__dirname, "../../../engines/openhwp-zig/zig-out/bin", ENGINE_BIN_NAME);
}

function bundledEngineBinPath() {
  return path.join(process.resourcesPath, "bin", ENGINE_BIN_NAME);
}

function resolveEngineBinPath() {
  const envOverride = process.env.OPENHWP_ENGINE_BIN?.trim();
  if (envOverride) {
    return envOverride;
  }

  const bundled = bundledEngineBinPath();
  if (fileExists(bundled)) {
    return bundled;
  }

  return devEngineBinPath();
}

function commandCandidates(commandName, pathext) {
  const names = [commandName];
  if (path.extname(commandName)) {
    return names;
  }

  for (const ext of (pathext ?? "").split(";")) {
    const normalized = ext.trim();
    if (!normalized) {
      continue;
    }

    names.push(`${commandName}${normalized}`);
  }

  return [...new Set(names)];
}

function findCommandInPath(commandName) {
  const pathEnv = process.env.PATH?.trim();
  if (!pathEnv) {
    return null;
  }

  const candidates = commandCandidates(commandName, process.env.PATHEXT);
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) {
      continue;
    }

    for (const candidateName of candidates) {
      const candidate = path.join(dir, candidateName);
      if (fileExists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function resolveConverterBinPath() {
  const envOverride = process.env.OPENHWP_HWPX_CONVERTER?.trim();
  if (envOverride) {
    return envOverride;
  }

  return findCommandInPath("hwpx-converter");
}

function currentEngineStatus() {
  const enginePath = resolveEngineBinPath();
  const converterPath = resolveConverterBinPath();
  const resourcesDir = path.resolve(process.resourcesPath);
  const normalizedEnginePath = path.resolve(enginePath);

  return {
    enginePath,
    engineAvailable: fileExists(enginePath),
    usingBundledEngine:
      normalizedEnginePath === resourcesDir ||
      normalizedEnginePath.startsWith(`${resourcesDir}${path.sep}`),
    converterPath,
    converterAvailable: fileExists(converterPath)
  };
}

function runEngine(args) {
  const enginePath = resolveEngineBinPath();

  return new Promise((resolve, reject) => {
    execFile(
      enginePath,
      args,
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }

        const message = stderr.trim() || stdout.trim() || error.message;
        reject(new Error(message));
      }
    );
  });
}

function suggestedFilePath(currentDoc, fallbackName, nextExtension) {
  if (!currentDoc) {
    return fallbackName;
  }

  const parsed = path.parse(currentDoc);
  return path.join(parsed.dir, `${parsed.name}${nextExtension}`);
}

async function pickDocumentPath() {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      {
        name: "HWP Documents",
        extensions: ["hwp", "hwpx"]
      }
    ]
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
}

async function pickOutputHwpxPath(currentDoc) {
  const result = await dialog.showSaveDialog({
    defaultPath: suggestedFilePath(currentDoc, "output.hwpx", ".converted.hwpx"),
    filters: [
      {
        name: "HWPX Document",
        extensions: ["hwpx"]
      }
    ]
  });

  return result.canceled ? null : (result.filePath ?? null);
}

async function pickSessionJsonPath(currentDoc) {
  const result = await dialog.showSaveDialog({
    defaultPath: suggestedFilePath(currentDoc, "session.json", ".session.json"),
    filters: [
      {
        name: "JSON",
        extensions: ["json"]
      }
    ]
  });

  return result.canceled ? null : (result.filePath ?? null);
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 960,
    minWidth: 960,
    minHeight: 720,
    show: false,
    title: "OpenHWP Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (isDevLaunch()) {
    void mainWindow.loadURL(DEV_RENDERER_URL);
    return mainWindow;
  }

  void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  return mainWindow;
}

function registerIpcHandlers() {
  ipcMain.handle("engine:getStatus", () => currentEngineStatus());
  ipcMain.handle("dialog:pickDocumentPath", () => pickDocumentPath());
  ipcMain.handle("dialog:pickOutputHwpxPath", (_event, currentDoc) =>
    pickOutputHwpxPath(currentDoc ?? null)
  );
  ipcMain.handle("dialog:pickSessionJsonPath", (_event, currentDoc) =>
    pickSessionJsonPath(currentDoc ?? null)
  );
  ipcMain.handle("engine:info", (_event, inputPath) => runEngine(["info", inputPath]));
  ipcMain.handle("engine:text", (_event, inputPath) => runEngine(["text", inputPath]));
  ipcMain.handle("engine:convert", (_event, inputPath, outputPath) =>
    runEngine(["convert", inputPath, "--output", outputPath])
  );
  ipcMain.handle("engine:workbenchExport", (_event, inputPath, outputJsonPath) =>
    runEngine(["workbench", "export", inputPath, "--output", outputJsonPath])
  );
  ipcMain.handle("engine:workbenchApply", (_event, inputPath, sessionJsonPath, outputPath) =>
    runEngine([
      "workbench",
      "apply",
      inputPath,
      sessionJsonPath,
      "--output",
      outputPath
    ])
  );
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
