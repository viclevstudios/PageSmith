const { app, BrowserWindow, dialog } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { Document, Packer, Paragraph, TextRun, ImageRun } = require("docx");
const { marked } = require("marked");

const execFileAsync = promisify(execFile);
const OFFICE_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  ".rtf",
]);
const MICROSOFT_WORD_EXTENSIONS = new Set([".doc", ".docx", ".rtf", ".odt"]);
const MICROSOFT_EXCEL_EXTENSIONS = new Set([".xls", ".xlsx", ".ods"]);
const MICROSOFT_POWERPOINT_EXTENSIONS = new Set([".ppt", ".pptx", ".odp"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const TEXT_EXTENSIONS = new Set([".txt"]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
let mainWindow;
let activeJobSettings = { conflictStrategy: "rename", language: "de" };

function setMainWindow(window) {
  mainWindow = window;
}

/** Runs a job with request-scoped output behaviour and restores the prior state. */
async function withJobSettings(settings, work) {
  const previousSettings = activeJobSettings;
  activeJobSettings = settings;
  try {
    return await work();
  } finally {
    activeJobSettings = previousSettings;
  }
}

function safeStem(filePath) {
  return (
    path
      .basename(filePath, path.extname(filePath))
      .replace(/[<>:"/\\|?*]/g, "_") || "Dokument"
  );
}
function outputPath(directory, source, suffix, extension) {
  return path.join(directory, `${safeStem(source)}${suffix}.${extension}`);
}
function isEnglish() {
  return activeJobSettings.language === "en";
}
function localiseError(message, language = "de") {
  if (language !== "en" || !message) return message;
  const exact = {
    "Der Auftrag wurde abgebrochen, damit keine bestehende Datei überschrieben wird.":
      "The job was cancelled to keep the existing file unchanged.",
    "Bitte einen Zielordner auswählen.": "Please choose a destination folder.",
    "Bitte mindestens eine Datei auswählen.":
      "Please select at least one file.",
    "Unbekanntes Werkzeug.": "Unknown tool.",
  };
  if (exact[message]) return exact[message];
  return message
    .replace(
      /^Bitte mindestens (\d+) PDF-Dateien auswählen\.$/,
      "Please select at least $1 PDF files.",
    )
    .replace(
      /^Nicht unterstütztes Eingabeformat: (.+)\.$/,
      "Unsupported input format: $1.",
    )
    .replace(
      /^Die PDF hat nur (\d+) Seiten; alle Trennstellen müssen davor liegen\.$/,
      "This PDF has only $1 pages; all split points must be before the final page.",
    )
    .replace(
      /^Bitte alle (\d+) Seiten genau einmal angeben, z\. B\. 2,1,3\.$/,
      "Please specify all $1 pages exactly once, for example 2,1,3.",
    );
}
async function uniqueOutputPath(destination) {
  const extension = path.extname(destination);
  const stem = destination.slice(0, destination.length - extension.length);
  let candidate = destination;
  let index = 1;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = `${stem} (${index++})${extension}`;
    } catch {
      return candidate;
    }
  }
}
async function prepareOutput(destination) {
  if (activeJobSettings.conflictStrategy !== "overwrite")
    return uniqueOutputPath(destination);
  try {
    await fs.access(destination);
  } catch {
    return destination;
  }
  const result = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    buttons: isEnglish()
      ? ["Overwrite", "Cancel"]
      : ["Überschreiben", "Abbrechen"],
    defaultId: 1,
    cancelId: 1,
    message: isEnglish() ? "A file already exists" : "Datei existiert bereits",
    detail: isEnglish()
      ? `“${path.basename(destination)}” already exists. Do you want to overwrite it?`
      : `„${path.basename(destination)}“ existiert bereits. Soll sie überschrieben werden?`,
  });
  if (result.response !== 0)
    throw new Error(
      isEnglish()
        ? "The job was cancelled to keep the existing file unchanged."
        : "Der Auftrag wurde abgebrochen, damit keine bestehende Datei überschrieben wird.",
    );
  return destination;
}
async function writeOutput(destination, data, encoding) {
  const target = await prepareOutput(destination);
  await fs.writeFile(target, data, encoding);
  return target;
}
async function copyOutput(source, destination) {
  const target = await prepareOutput(destination);
  await fs.copyFile(source, target);
  return target;
}
function requireFiles(files, min = 1) {
  if (!Array.isArray(files) || files.length < min)
    throw new Error(
      min > 1
        ? `Bitte mindestens ${min} PDF-Dateien auswählen.`
        : "Bitte mindestens eine Datei auswählen.",
    );
}
function requireOutputDir(outputDir) {
  if (!outputDir) throw new Error("Bitte einen Zielordner auswählen.");
}
function normaliseNewlines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

module.exports = {
  copyOutput,
  escapeHtml,
  localiseError,
  normaliseNewlines,
  outputPath,
  prepareOutput,
  requireFiles,
  requireOutputDir,
  safeStem,
  setMainWindow,
  withJobSettings,
  writeOutput,
};
