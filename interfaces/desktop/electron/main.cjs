const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DEV_RENDERER_URL = "http://127.0.0.1:1420";
const ENGINE_BIN_NAME = process.platform === "win32" ? "openhwp.exe" : "openhwp";
const RECENT_DOCUMENT_LIMIT = 10;

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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
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

function documentWorkspaceRoot() {
  return ensureDir(path.join(app.getPath("userData"), "document-workspaces"));
}

function createWorkspaceDir() {
  return fs.mkdtempSync(path.join(documentWorkspaceRoot(), "doc-"));
}

function recentDocumentsPath() {
  return path.join(app.getPath("userData"), "recent-documents.json");
}

function sourceFormatFor(targetPath) {
  const extension = path.extname(targetPath).toLowerCase();
  if (extension === ".hwp" || extension === ".hwpx") {
    return extension.slice(1);
  }

  throw new Error("지원하지 않는 문서 형식입니다. .hwp 또는 .hwpx 파일만 열 수 있습니다.");
}

function defaultSavePath(documentState) {
  const basePath = documentState.saveTargetPath ?? documentState.sourcePath;
  const parsed = path.parse(basePath);
  return path.join(parsed.dir, `${parsed.name}.hwpx`);
}

function normalizeHwpxTargetPath(targetPath) {
  const absolute = path.resolve(targetPath);
  if (path.extname(absolute).toLowerCase() === ".hwpx") {
    return absolute;
  }

  const parsed = path.parse(absolute);
  return path.join(parsed.dir, `${parsed.name}.hwpx`);
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readRecentDocuments() {
  const raw = readJsonFile(recentDocumentsPath(), []);
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((entry) => entry && typeof entry.path === "string" && fileExists(entry.path))
    .map((entry) => {
      const documentPath = path.resolve(entry.path);
      return {
        path: documentPath,
        label: typeof entry.label === "string" && entry.label ? entry.label : path.basename(documentPath),
        lastOpenedAt:
          typeof entry.lastOpenedAt === "string" && entry.lastOpenedAt
            ? entry.lastOpenedAt
            : new Date().toISOString(),
        sourceFormat: sourceFormatFor(documentPath)
      };
    })
    .slice(0, RECENT_DOCUMENT_LIMIT);
}

function pushRecentDocument(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fileExists(absolutePath)) {
    return;
  }

  const nextEntry = {
    path: absolutePath,
    label: path.basename(absolutePath),
    lastOpenedAt: new Date().toISOString(),
    sourceFormat: sourceFormatFor(absolutePath)
  };

  const deduped = readRecentDocuments().filter((entry) => path.resolve(entry.path) !== absolutePath);
  writeJsonFile(recentDocumentsPath(), [nextEntry, ...deduped].slice(0, RECENT_DOCUMENT_LIMIT));
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

async function pickSaveTargetPath(documentState) {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultSavePath(documentState),
    filters: [
      {
        name: "HWPX Document",
        extensions: ["hwpx"]
      }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return normalizeHwpxTargetPath(result.filePath);
}

async function exportWorkbenchSession(workingHwpxPath, workspaceDir) {
  const sessionJsonPath = path.join(workspaceDir, "session.json");
  await runEngine(["workbench", "export", workingHwpxPath, "--output", sessionJsonPath]);
  return readJsonFile(sessionJsonPath, null);
}

function validateDocumentState(documentState) {
  if (!documentState || typeof documentState !== "object") {
    throw new Error("문서 상태가 올바르지 않습니다.");
  }

  if (typeof documentState.workingDirectory !== "string" || !documentState.workingDirectory) {
    throw new Error("문서 작업 디렉터리를 찾지 못했습니다.");
  }

  if (typeof documentState.workingHwpxPath !== "string" || !documentState.workingHwpxPath) {
    throw new Error("문서 작업 파일 경로가 비어 있습니다.");
  }

  if (!documentState.session) {
    throw new Error("문서 편집 세션이 비어 있습니다.");
  }
}

async function openDocumentPath(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fileExists(absolutePath)) {
    throw new Error("문서를 찾지 못했습니다.");
  }

  const sourceFormat = sourceFormatFor(absolutePath);
  const workspaceDir = createWorkspaceDir();

  let workingHwpxPath = absolutePath;
  let openMode = "direct-hwpx";
  let saveTargetPath = absolutePath;
  let importedFromLegacyHwp = false;

  if (sourceFormat === "hwp") {
    workingHwpxPath = path.join(workspaceDir, `${path.parse(absolutePath).name}.imported.hwpx`);
    await runEngine(["convert", absolutePath, "--output", workingHwpxPath]);
    openMode = "imported-hwp";
    saveTargetPath = null;
    importedFromLegacyHwp = true;
  }

  const session = await exportWorkbenchSession(workingHwpxPath, workspaceDir);
  if (!session) {
    throw new Error("문서 편집 세션을 불러오지 못했습니다.");
  }

  pushRecentDocument(absolutePath);

  return {
    sourcePath: absolutePath,
    sourceFormat,
    openMode,
    workingDirectory: workspaceDir,
    workingHwpxPath,
    saveTargetPath,
    importedFromLegacyHwp,
    session,
    dirty: false,
    lastSavedAt: null
  };
}

async function openDocumentWithDialog() {
  const selectedPath = await pickDocumentPath();
  if (!selectedPath) {
    return null;
  }

  return openDocumentPath(selectedPath);
}

async function writeDocumentToTarget(documentState, targetPath) {
  validateDocumentState(documentState);

  const workspaceDir = ensureDir(documentState.workingDirectory);
  const absoluteTarget = normalizeHwpxTargetPath(targetPath);
  const sessionJsonPath = path.join(workspaceDir, "pending-session.json");
  const tempOutputPath = path.join(workspaceDir, `saved-${Date.now()}.hwpx`);

  writeJsonFile(sessionJsonPath, documentState.session);
  await runEngine([
    "workbench",
    "apply",
    documentState.workingHwpxPath,
    sessionJsonPath,
    "--output",
    tempOutputPath
  ]);

  ensureDir(path.dirname(absoluteTarget));
  fs.copyFileSync(tempOutputPath, absoluteTarget);
  fs.unlinkSync(tempOutputPath);

  pushRecentDocument(absoluteTarget);

  return {
    ...documentState,
    saveTargetPath: absoluteTarget,
    dirty: false,
    lastSavedAt: new Date().toISOString()
  };
}

async function saveDocument(documentState) {
  if (!documentState.saveTargetPath) {
    throw new Error("가져온 HWP 문서는 HWPX로 저장해야 합니다. Save As를 사용하세요.");
  }

  return writeDocumentToTarget(documentState, documentState.saveTargetPath);
}

async function saveDocumentAs(documentState) {
  const targetPath = await pickSaveTargetPath(documentState);
  if (!targetPath) {
    return null;
  }

  return writeDocumentToTarget(documentState, targetPath);
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    title: "OpenHWP Desktop",
    backgroundColor: "#ffffff",
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
  ipcMain.handle("document:open", () => openDocumentWithDialog());
  ipcMain.handle("document:openPath", (_event, filePath) => openDocumentPath(filePath));
  ipcMain.handle("document:getRecent", () => readRecentDocuments());
  ipcMain.handle("document:save", (_event, documentState) => saveDocument(documentState));
  ipcMain.handle("document:saveAs", (_event, documentState) => saveDocumentAs(documentState));
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
