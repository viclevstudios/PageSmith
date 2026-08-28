const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { marked } = require("marked");
const {
  copyOutput,
  normaliseNewlines,
  outputPath,
  prepareOutput,
  safeStem,
  writeOutput,
} = require("./runtime");

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

// Converts every supported input type into a local PDF without changing its source.
async function createTextPdf(text, destination, title) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 595.28,
    height = 841.89,
    margin = 52,
    lineHeight = 15;
  let page, y;
  const newPage = () => {
    page = pdf.addPage([width, height]);
    y = height - margin;
  };
  newPage();
  page.drawText(title, {
    x: margin,
    y,
    size: 16,
    font: bold,
    color: rgb(0.08, 0.11, 0.16),
  });
  y -= 30;
  for (const sourceLine of normaliseNewlines(text).split("\n")) {
    const words = sourceLine.split(/\s+/).filter(Boolean);
    const lines = words.length
      ? wrapWords(words, font, 10.5, width - margin * 2)
      : [""];
    for (const line of lines) {
      if (y < margin) newPage();
      page.drawText(line, {
        x: margin,
        y,
        size: 10.5,
        font,
        color: rgb(0.15, 0.18, 0.23),
      });
      y -= lineHeight;
    }
  }
  return writeOutput(destination, await pdf.save());
}
function wrapWords(words, font, size, maxWidth) {
  const result = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      result.push(line);
      line = word;
    } else line = candidate;
  }
  if (line || !result.length) result.push(line);
  return result;
}
async function printHtmlToPdf(html, destination) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true },
  });
  try {
    const styled = `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:18mm}body{font-family:Segoe UI,Arial,sans-serif;color:#18202b;line-height:1.5}img{max-width:100%}pre{white-space:pre-wrap;background:#f3f5f7;padding:12px}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:6px}</style></head><body>${html}</body></html>`;
    await win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(styled)}`,
    );
    return await writeOutput(
      destination,
      await win.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
      }),
    );
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}
async function findExecutable(names) {
  const candidates = [];
  for (const name of names) {
    candidates.push(name);
    candidates.push(
      path.join("C:\\Program Files", "LibreOffice", "program", name),
    );
    candidates.push(
      path.join("C:\\Program Files (x86)", "LibreOffice", "program", name),
    );
    candidates.push(
      path.join("C:\\Program Files", "gs", "gs10.0.0", "bin", name),
    );
  }
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["--version"], {
        windowsHide: true,
        timeout: 8000,
      });
      return candidate;
    } catch {
      /* next candidate */
    }
  }
  return null;
}
function powerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
async function microsoftOfficeToPdf(source, destination) {
  const extension = path.extname(source).toLowerCase();
  const target = await prepareOutput(destination);
  const sourceLiteral = powerShellLiteral(source),
    destinationLiteral = powerShellLiteral(target);
  let script;
  if (MICROSOFT_WORD_EXTENSIONS.has(extension))
    script = `$ErrorActionPreference='Stop'; $app=New-Object -ComObject Word.Application; $app.Visible=$false; $app.DisplayAlerts=0; try { $document=$app.Documents.Open(${sourceLiteral},$false,$true); $document.ExportAsFixedFormat(${destinationLiteral},17); $document.Close($false) } finally { $app.Quit() }`;
  else if (MICROSOFT_EXCEL_EXTENSIONS.has(extension))
    script = `$ErrorActionPreference='Stop'; $app=New-Object -ComObject Excel.Application; $app.Visible=$false; $app.DisplayAlerts=$false; try { $book=$app.Workbooks.Open(${sourceLiteral},0,$true); $book.ExportAsFixedFormat(0,${destinationLiteral}); $book.Close($false) } finally { $app.Quit() }`;
  else if (MICROSOFT_POWERPOINT_EXTENSIONS.has(extension))
    script = `$ErrorActionPreference='Stop'; $app=New-Object -ComObject PowerPoint.Application; try { $presentation=$app.Presentations.Open(${sourceLiteral},$true,$false,$false); $presentation.SaveAs(${destinationLiteral},32); $presentation.Close() } finally { $app.Quit() }`;
  else throw new Error(`Microsoft Office unterstützt „${extension}“ nicht.`);
  await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    { windowsHide: true, timeout: 120000 },
  );
  await fs.access(target);
  return target;
}
async function libreOfficeToPdf(source, outputDir) {
  const soffice = await findExecutable(["soffice.exe", "soffice"]);
  if (!soffice) throw new Error("LibreOffice wurde nicht gefunden.");
  const target = await prepareOutput(
    path.join(outputDir, `${safeStem(source)}.pdf`),
  );
  const temporaryDirectory =
    target === path.join(outputDir, `${safeStem(source)}.pdf`)
      ? outputDir
      : await fs.mkdtemp(path.join(app.getPath("temp"), "pagesmith-office-"));
  try {
    await execFileAsync(
      soffice,
      [
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        temporaryDirectory,
        source,
      ],
      { windowsHide: true, timeout: 120000 },
    );
    const generated = path.join(temporaryDirectory, `${safeStem(source)}.pdf`);
    try {
      await fs.access(generated);
    } catch {
      throw new Error(
        `LibreOffice konnte „${path.basename(source)}“ nicht in PDF umwandeln.`,
      );
    }
    if (generated !== target) await fs.rename(generated, target);
    return target;
  } finally {
    if (temporaryDirectory !== outputDir)
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}
async function officeToPdf(source, outputDir) {
  const extension = path.extname(source).toLowerCase();
  const destination = outputPath(outputDir, source, "", "pdf");
  const preferLibreOffice = [".odt", ".ods", ".odp"].includes(extension);
  const converters = preferLibreOffice
    ? [
        () => libreOfficeToPdf(source, outputDir),
        () => microsoftOfficeToPdf(source, destination),
      ]
    : [
        () => microsoftOfficeToPdf(source, destination),
        () => libreOfficeToPdf(source, outputDir),
      ];
  const failures = [];
  for (const convert of converters) {
    try {
      return await convert();
    } catch (error) {
      failures.push(error.message);
    }
  }
  throw new Error(
    `„${path.basename(source)}“ konnte nicht in PDF umgewandelt werden. Bitte Microsoft Office oder LibreOffice installieren bzw. die Datei in einer unterstützten Desktop-Anwendung öffnen. Details: ${failures.join(" | ")}`,
  );
}
async function convertToPdf(files, outputDir, options = {}) {
  const combine = options.combine === "single" && files.length > 1;
  const workingDirectory = combine
    ? await fs.mkdtemp(path.join(app.getPath("temp"), "pdf-werkstatt-"))
    : outputDir;
  const outputs = [];
  for (const source of files) {
    const ext = path.extname(source).toLowerCase();
    const destination = outputPath(workingDirectory, source, "", "pdf");
    if (ext === ".pdf") outputs.push(await copyOutput(source, destination));
    else if (TEXT_EXTENSIONS.has(ext))
      outputs.push(
        await createTextPdf(
          await fs.readFile(source, "utf8"),
          destination,
          safeStem(source),
        ),
      );
    else if (MARKDOWN_EXTENSIONS.has(ext))
      outputs.push(
        await printHtmlToPdf(
          marked.parse(await fs.readFile(source, "utf8")),
          destination,
        ),
      );
    else if (HTML_EXTENSIONS.has(ext))
      outputs.push(
        await printHtmlToPdf(await fs.readFile(source, "utf8"), destination),
      );
    else if (IMAGE_EXTENSIONS.has(ext)) {
      const pdf = await PDFDocument.create();
      const imageBytes = await fs.readFile(source);
      const image =
        ext === ".png"
          ? await pdf.embedPng(imageBytes)
          : await pdf.embedJpg(imageBytes);
      const landscape = image.width > image.height;
      const pageWidth = landscape ? 841.89 : 595.28;
      const pageHeight = landscape ? 595.28 : 841.89;
      const margin = 14;
      const scale = Math.min(
        (pageWidth - margin * 2) / image.width,
        (pageHeight - margin * 2) / image.height,
      );
      const w = image.width * scale,
        h = image.height * scale;
      const page = pdf.addPage([pageWidth, pageHeight]);
      page.drawImage(image, {
        x: (pageWidth - w) / 2,
        y: (pageHeight - h) / 2,
        width: w,
        height: h,
      });
      outputs.push(await writeOutput(destination, await pdf.save()));
    } else if (OFFICE_EXTENSIONS.has(ext))
      outputs.push(await officeToPdf(source, workingDirectory));
    else
      throw new Error(
        `Nicht unterstütztes Eingabeformat: ${ext || "ohne Dateiendung"}.`,
      );
  }
  if (!combine) return outputs;
  const combined = await PDFDocument.create();
  for (const file of outputs) {
    const source = await PDFDocument.load(await fs.readFile(file));
    const pages = await combined.copyPages(source, source.getPageIndices());
    pages.forEach((page) => combined.addPage(page));
  }
  const target = path.join(outputDir, "PDF-umgewandelt.pdf");
  const savedTarget = await writeOutput(target, await combined.save());
  await fs.rm(workingDirectory, { recursive: true, force: true });
  return [savedTarget];
}

module.exports = { convertToPdf, findExecutable };
