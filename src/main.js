const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");
const jobs = require("./backend/job-runner");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: "#0e1116",
    title: "PageSmith PDF",
    icon: path.join(__dirname, "pagesmith-mark.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  jobs.setMainWindow(mainWindow);
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

async function getPdfThumbnails(filePath, pageNumbers) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = require("@napi-rs/canvas");
  const data = new Uint8Array(await fs.readFile(filePath));
  const document = await pdfjs.getDocument({ data, disableWorker: true })
    .promise;
  const results = [];
  for (const pageNumber of pageNumbers) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 0.28 });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    await page.render({ canvasContext: canvas.getContext("2d"), viewport })
      .promise;
    results.push({
      pageNumber,
      dataUrl: `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`,
    });
  }
  return results;
}

function registerIpcHandlers() {
  ipcMain.handle("select-files", async (_event, filters) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"],
      filters,
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle("select-output-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      defaultPath: app.getPath("downloads"),
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("get-default-output-folder", () => app.getPath("downloads"));
  ipcMain.handle("reveal-file", (_event, filePath) =>
    shell.showItemInFolder(filePath),
  );
  ipcMain.handle("open-folder", (_event, folderPath) =>
    shell.openPath(folderPath),
  );
  ipcMain.handle("get-pdf-info", async (_event, filePath) => ({
    pageCount: (
      await PDFDocument.load(await fs.readFile(filePath))
    ).getPageCount(),
  }));
  ipcMain.handle("get-pdf-thumbnails", (_event, filePath, pageNumbers) =>
    getPdfThumbnails(filePath, pageNumbers),
  );
  ipcMain.handle("run-job", async (_event, request) => {
    try {
      return await jobs.runJob(request);
    } catch (error) {
      throw new Error(jobs.localiseError(error.message, request.language));
    }
  });
}

if (process.env.PAGESMITH_TEST !== "1") {
  app.whenReady().then(() => {
    createWindow();
    registerIpcHandlers();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

module.exports = jobs;
