const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { Document, Packer, Paragraph, TextRun, ImageRun } = require('docx');
const { marked } = require('marked');

const execFileAsync = promisify(execFile);
const OFFICE_EXTENSIONS = new Set(['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.rtf']);
const MICROSOFT_WORD_EXTENSIONS = new Set(['.doc', '.docx', '.rtf', '.odt']);
const MICROSOFT_EXCEL_EXTENSIONS = new Set(['.xls', '.xlsx', '.ods']);
const MICROSOFT_POWERPOINT_EXTENSIONS = new Set(['.ppt', '.pptx', '.odp']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const TEXT_EXTENSIONS = new Set(['.txt']);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
let mainWindow;
let activeJobSettings = { conflictStrategy: 'rename', language: 'de' };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: '#0e1116',
    title: 'PageSmith PDF',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

if (process.env.PAGESMITH_TEST !== '1') {
  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

  ipcMain.handle('select-files', async (_event, filters) => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'], filters });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('select-output-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { defaultPath: app.getPath('downloads'), properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('get-default-output-folder', () => app.getPath('downloads'));
  ipcMain.handle('reveal-file', (_event, filePath) => shell.showItemInFolder(filePath));
  ipcMain.handle('open-folder', async (_event, folderPath) => shell.openPath(folderPath));
  ipcMain.handle('get-pdf-info', async (_event, filePath) => {
    const document = await PDFDocument.load(await fs.readFile(filePath));
    return { pageCount: document.getPageCount() };
  });
  ipcMain.handle('get-pdf-thumbnails', async (_event, filePath, pageNumbers) => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); const { createCanvas } = require('@napi-rs/canvas');
    const data = new Uint8Array(await fs.readFile(filePath)); const document = await pdfjs.getDocument({ data, disableWorker: true }).promise; const results = [];
    for (const pageNumber of pageNumbers) {
      const page = await document.getPage(pageNumber); const viewport = page.getViewport({ scale: 0.28 }); const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      results.push({ pageNumber, dataUrl: `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}` });
    }
    return results;
  });
  ipcMain.handle('run-job', async (_event, request) => {
    try { return await runJob(request); } catch (error) { throw new Error(localiseError(error.message, request.language)); }
  });
}

function safeStem(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/[<>:"/\\|?*]/g, '_') || 'Dokument';
}
function outputPath(directory, source, suffix, extension) {
  return path.join(directory, `${safeStem(source)}${suffix}.${extension}`);
}
function isEnglish() { return activeJobSettings.language === 'en'; }
function localiseError(message, language = 'de') {
  if (language !== 'en' || !message) return message;
  const exact = {
    'Der Auftrag wurde abgebrochen, damit keine bestehende Datei überschrieben wird.': 'The job was cancelled to keep the existing file unchanged.',
    'Bitte einen Zielordner auswählen.': 'Please choose a destination folder.',
    'Bitte mindestens eine Datei auswählen.': 'Please select at least one file.',
    'Unbekanntes Werkzeug.': 'Unknown tool.'
  };
  if (exact[message]) return exact[message];
  return message
    .replace(/^Bitte mindestens (\d+) PDF-Dateien auswählen\.$/, 'Please select at least $1 PDF files.')
    .replace(/^Nicht unterstütztes Eingabeformat: (.+)\.$/, 'Unsupported input format: $1.')
    .replace(/^Die PDF hat nur (\d+) Seiten; alle Trennstellen müssen davor liegen\.$/, 'This PDF has only $1 pages; all split points must be before the final page.')
    .replace(/^Bitte alle (\d+) Seiten genau einmal angeben, z\. B\. 2,1,3\.$/, 'Please specify all $1 pages exactly once, for example 2,1,3.');
}
async function uniqueOutputPath(destination) {
  const extension = path.extname(destination); const stem = destination.slice(0, destination.length - extension.length);
  let candidate = destination; let index = 1;
  while (true) { try { await fs.access(candidate); candidate = `${stem} (${index++})${extension}`; } catch { return candidate; } }
}
async function prepareOutput(destination) {
  if (activeJobSettings.conflictStrategy !== 'overwrite') return uniqueOutputPath(destination);
  try { await fs.access(destination); } catch { return destination; }
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning', buttons: isEnglish() ? ['Overwrite', 'Cancel'] : ['Überschreiben', 'Abbrechen'], defaultId: 1, cancelId: 1,
    message: isEnglish() ? 'A file already exists' : 'Datei existiert bereits',
    detail: isEnglish() ? `“${path.basename(destination)}” already exists. Do you want to overwrite it?` : `„${path.basename(destination)}“ existiert bereits. Soll sie überschrieben werden?`
  });
  if (result.response !== 0) throw new Error(isEnglish() ? 'The job was cancelled to keep the existing file unchanged.' : 'Der Auftrag wurde abgebrochen, damit keine bestehende Datei überschrieben wird.');
  return destination;
}
async function writeOutput(destination, data, encoding) { const target = await prepareOutput(destination); await fs.writeFile(target, data, encoding); return target; }
async function copyOutput(source, destination) { const target = await prepareOutput(destination); await fs.copyFile(source, target); return target; }
function requireFiles(files, min = 1) {
  if (!Array.isArray(files) || files.length < min) throw new Error(min > 1 ? `Bitte mindestens ${min} PDF-Dateien auswählen.` : 'Bitte mindestens eine Datei auswählen.');
}
function requireOutputDir(outputDir) {
  if (!outputDir) throw new Error('Bitte einen Zielordner auswählen.');
}
function normaliseNewlines(text) { return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'); }
function escapeHtml(value) { return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
async function createTextPdf(text, destination, title) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 595.28, height = 841.89, margin = 52, lineHeight = 15;
  let page, y;
  const newPage = () => { page = pdf.addPage([width, height]); y = height - margin; };
  newPage();
  page.drawText(title, { x: margin, y, size: 16, font: bold, color: rgb(0.08, 0.11, 0.16) });
  y -= 30;
  for (const sourceLine of normaliseNewlines(text).split('\n')) {
    const words = sourceLine.split(/\s+/).filter(Boolean);
    const lines = words.length ? wrapWords(words, font, 10.5, width - margin * 2) : [''];
    for (const line of lines) {
      if (y < margin) newPage();
      page.drawText(line, { x: margin, y, size: 10.5, font, color: rgb(0.15, 0.18, 0.23) });
      y -= lineHeight;
    }
  }
  return writeOutput(destination, await pdf.save());
}
function wrapWords(words, font, size, maxWidth) {
  const result = []; let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) { result.push(line); line = word; } else line = candidate;
  }
  if (line || !result.length) result.push(line);
  return result;
}
async function printHtmlToPdf(html, destination) {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    const styled = `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:18mm}body{font-family:Segoe UI,Arial,sans-serif;color:#18202b;line-height:1.5}img{max-width:100%}pre{white-space:pre-wrap;background:#f3f5f7;padding:12px}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:6px}</style></head><body>${html}</body></html>`;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(styled)}`);
    return await writeOutput(destination, await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true }));
  } finally { if (!win.isDestroyed()) win.destroy(); }
}
async function findExecutable(names) {
  const candidates = [];
  for (const name of names) {
    candidates.push(name);
    candidates.push(path.join('C:\\Program Files', 'LibreOffice', 'program', name));
    candidates.push(path.join('C:\\Program Files (x86)', 'LibreOffice', 'program', name));
    candidates.push(path.join('C:\\Program Files', 'gs', 'gs10.0.0', 'bin', name));
  }
  for (const candidate of candidates) {
    try { await execFileAsync(candidate, ['--version'], { windowsHide: true, timeout: 8000 }); return candidate; } catch { /* next candidate */ }
  }
  return null;
}
function powerShellLiteral(value) { return `'${String(value).replace(/'/g, "''")}'`; }
async function microsoftOfficeToPdf(source, destination) {
  const extension = path.extname(source).toLowerCase();
  const target = await prepareOutput(destination); const sourceLiteral = powerShellLiteral(source), destinationLiteral = powerShellLiteral(target);
  let script;
  if (MICROSOFT_WORD_EXTENSIONS.has(extension)) script = `$ErrorActionPreference='Stop'; $app=New-Object -ComObject Word.Application; $app.Visible=$false; $app.DisplayAlerts=0; try { $document=$app.Documents.Open(${sourceLiteral},$false,$true); $document.ExportAsFixedFormat(${destinationLiteral},17); $document.Close($false) } finally { $app.Quit() }`;
  else if (MICROSOFT_EXCEL_EXTENSIONS.has(extension)) script = `$ErrorActionPreference='Stop'; $app=New-Object -ComObject Excel.Application; $app.Visible=$false; $app.DisplayAlerts=$false; try { $book=$app.Workbooks.Open(${sourceLiteral},0,$true); $book.ExportAsFixedFormat(0,${destinationLiteral}); $book.Close($false) } finally { $app.Quit() }`;
  else if (MICROSOFT_POWERPOINT_EXTENSIONS.has(extension)) script = `$ErrorActionPreference='Stop'; $app=New-Object -ComObject PowerPoint.Application; try { $presentation=$app.Presentations.Open(${sourceLiteral},$true,$false,$false); $presentation.SaveAs(${destinationLiteral},32); $presentation.Close() } finally { $app.Quit() }`;
  else throw new Error(`Microsoft Office unterstützt „${extension}“ nicht.`);
  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, timeout: 120000 });
  await fs.access(target);
  return target;
}
async function libreOfficeToPdf(source, outputDir) {
  const soffice = await findExecutable(['soffice.exe', 'soffice']);
  if (!soffice) throw new Error('LibreOffice wurde nicht gefunden.');
  const target = await prepareOutput(path.join(outputDir, `${safeStem(source)}.pdf`));
  const temporaryDirectory = target === path.join(outputDir, `${safeStem(source)}.pdf`) ? outputDir : await fs.mkdtemp(path.join(app.getPath('temp'), 'pagesmith-office-'));
  try {
    await execFileAsync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', temporaryDirectory, source], { windowsHide: true, timeout: 120000 });
    const generated = path.join(temporaryDirectory, `${safeStem(source)}.pdf`); try { await fs.access(generated); } catch { throw new Error(`LibreOffice konnte „${path.basename(source)}“ nicht in PDF umwandeln.`); }
    if (generated !== target) await fs.rename(generated, target); return target;
  } finally { if (temporaryDirectory !== outputDir) await fs.rm(temporaryDirectory, { recursive: true, force: true }); }
}
async function officeToPdf(source, outputDir) {
  const extension = path.extname(source).toLowerCase();
  const destination = outputPath(outputDir, source, '', 'pdf');
  const preferLibreOffice = ['.odt', '.ods', '.odp'].includes(extension);
  const converters = preferLibreOffice
    ? [() => libreOfficeToPdf(source, outputDir), () => microsoftOfficeToPdf(source, destination)]
    : [() => microsoftOfficeToPdf(source, destination), () => libreOfficeToPdf(source, outputDir)];
  const failures = [];
  for (const convert of converters) {
    try { return await convert(); } catch (error) { failures.push(error.message); }
  }
  throw new Error(`„${path.basename(source)}“ konnte nicht in PDF umgewandelt werden. Bitte Microsoft Office oder LibreOffice installieren bzw. die Datei in einer unterstützten Desktop-Anwendung öffnen. Details: ${failures.join(' | ')}`);
}
async function convertToPdf(files, outputDir, options = {}) {
  const combine = options.combine === 'single' && files.length > 1;
  const workingDirectory = combine ? await fs.mkdtemp(path.join(app.getPath('temp'), 'pdf-werkstatt-')) : outputDir;
  const outputs = [];
  for (const source of files) {
    const ext = path.extname(source).toLowerCase();
    const destination = outputPath(workingDirectory, source, '', 'pdf');
    if (ext === '.pdf') outputs.push(await copyOutput(source, destination));
    else if (TEXT_EXTENSIONS.has(ext)) outputs.push(await createTextPdf(await fs.readFile(source, 'utf8'), destination, safeStem(source)));
    else if (MARKDOWN_EXTENSIONS.has(ext)) outputs.push(await printHtmlToPdf(marked.parse(await fs.readFile(source, 'utf8')), destination));
    else if (HTML_EXTENSIONS.has(ext)) outputs.push(await printHtmlToPdf(await fs.readFile(source, 'utf8'), destination));
    else if (IMAGE_EXTENSIONS.has(ext)) {
      const pdf = await PDFDocument.create(); const imageBytes = await fs.readFile(source);
      const image = ext === '.png' ? await pdf.embedPng(imageBytes) : await pdf.embedJpg(imageBytes);
      const landscape = image.width > image.height; const pageWidth = landscape ? 841.89 : 595.28; const pageHeight = landscape ? 595.28 : 841.89;
      const margin = 14; const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
      const w = image.width * scale, h = image.height * scale; const page = pdf.addPage([pageWidth, pageHeight]);
      page.drawImage(image, { x: (pageWidth - w) / 2, y: (pageHeight - h) / 2, width: w, height: h });
      outputs.push(await writeOutput(destination, await pdf.save()));
    } else if (OFFICE_EXTENSIONS.has(ext)) outputs.push(await officeToPdf(source, workingDirectory));
    else throw new Error(`Nicht unterstütztes Eingabeformat: ${ext || 'ohne Dateiendung'}.`);
  }
  if (!combine) return outputs;
  const combined = await PDFDocument.create();
  for (const file of outputs) { const source = await PDFDocument.load(await fs.readFile(file)); const pages = await combined.copyPages(source, source.getPageIndices()); pages.forEach(page => combined.addPage(page)); }
  const target = path.join(outputDir, 'PDF-umgewandelt.pdf');
  const savedTarget = await writeOutput(target, await combined.save());
  await fs.rm(workingDirectory, { recursive: true, force: true });
  return [savedTarget];
}
async function extractPdfText(source) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await fs.readFile(source));
  const document = await pdfjs.getDocument({ data, disableWorker: true }).promise;
  const pages = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number); const content = await page.getTextContent();
    const fragments = content.items.filter(item => item.str && item.str.trim()).map(item => ({ text: item.str, x: item.transform[4], y: item.transform[5] }));
    const lines = [];
    for (const fragment of fragments) {
      let line = lines.find(candidate => Math.abs(candidate.y - fragment.y) < 3);
      if (!line) { line = { y: fragment.y, fragments: [] }; lines.push(line); }
      line.fragments.push(fragment);
    }
    pages.push(lines.sort((a, b) => b.y - a.y).map(line => line.fragments.sort((a, b) => a.x - b.x).map(fragment => fragment.text).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n'));
  }
  return pages;
}
async function renderPdfPages(source) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = require('@napi-rs/canvas');
  const data = new Uint8Array(await fs.readFile(source)); const document = await pdfjs.getDocument({ data, disableWorker: true }).promise;
  const rendered = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number); const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    rendered.push({ data: canvas.toBuffer('image/png'), width: Math.round(viewport.width), height: Math.round(viewport.height) });
  }
  return rendered;
}
async function exportPdf(source, outputDir, format) {
  const pages = await extractPdfText(source); const text = pages.join('\n\n');
  const target = outputPath(outputDir, source, '', format);
  if (format === 'txt') return [await writeOutput(target, text, 'utf8')];
  if (format !== 'txt') {
    const rendered = await renderPdfPages(source);
    if (format === 'html') return [await writeOutput(target, `<!doctype html><html lang="de"><meta charset="utf-8"><title>${escapeHtml(safeStem(source))}</title><style>body{margin:0;background:#20242b}img{display:block;width:min(100%,1100px);margin:18px auto;background:white;box-shadow:0 3px 18px #0008}</style><body>${rendered.map((page, index) => `<img alt="Seite ${index + 1}" src="data:image/png;base64,${page.data.toString('base64')}">`).join('')}</body></html>`, 'utf8')];
    if (format === 'md') {
      const assets = path.join(outputDir, `${safeStem(source)}-Seiten`); await fs.mkdir(assets, { recursive: true }); const links = [];
      for (const [index, page] of rendered.entries()) { const name = `Seite-${index + 1}.png`; const saved = await writeOutput(path.join(assets, name), page.data); links.push(`![Seite ${index + 1}](${path.basename(assets)}/${path.basename(saved)})`); }
      return [await writeOutput(target, links.join('\n\n'), 'utf8')];
    }
    if (format === 'docx') {
      const document = new Document({ sections: [{ children: pages.flatMap((pageText, index) => {
        const heading = new Paragraph({ children: [new TextRun({ text: `Seite ${index + 1}`, bold: true })], spacing: { after: 160 } });
        if (pageText.trim()) return [heading, ...pageText.split('\n').map(textPart => new Paragraph({ text: textPart, spacing: { after: 70 } }))];
        const page = rendered[index]; return [heading, new Paragraph({ children: [new ImageRun({ data: page.data, transformation: { width: Math.min(page.width, 520), height: Math.round(Math.min(page.width, 520) * page.height / page.width) } })] })];
      }) }] });
      return [await writeOutput(target, await Packer.toBuffer(document))];
    }
  }
  throw new Error(`Nicht unterstütztes Ausgabeformat: ${format}.`);
}
async function mergePdfs(files, outputDir) {
  requireFiles(files, 2); const result = await PDFDocument.create();
  for (const file of files) { const source = await PDFDocument.load(await fs.readFile(file)); const pages = await result.copyPages(source, source.getPageIndices()); pages.forEach(page => result.addPage(page)); }
  const target = path.join(outputDir, 'PDF-zusammengefuegt.pdf'); return [await writeOutput(target, await result.save())];
}
function parsePositiveNumber(value, description) { const n = Number.parseInt(value, 10); if (!Number.isInteger(n) || n < 1) throw new Error(`${description} muss eine positive Seitenzahl sein.`); return n; }
async function splitPdf(source, outputDir, splitAfter) {
  requireFiles(source); const input = await PDFDocument.load(await fs.readFile(source[0]));
  const cuts = [...new Set(String(splitAfter).split(',').map(value => parsePositiveNumber(value.trim(), 'Jede Trennstelle')))].sort((a, b) => a - b);
  if (cuts.some(cut => cut >= input.getPageCount())) throw new Error(`Die PDF hat nur ${input.getPageCount()} Seiten; alle Trennstellen müssen davor liegen.`);
  const outputs = []; let start = 0;
  for (const [part, end] of [...cuts, input.getPageCount()].entries()) {
    const doc = await PDFDocument.create(); const indices = [...Array(end - start).keys()].map(index => start + index);
    const pages = await doc.copyPages(input, indices); pages.forEach(page => doc.addPage(page));
    const target = outputPath(outputDir, source[0], `-Teil-${part + 1}`, 'pdf'); outputs.push(await writeOutput(target, await doc.save())); start = end;
  }
  return outputs;
}
async function reorderPdf(source, outputDir, order) {
  requireFiles(source); const input = await PDFDocument.load(await fs.readFile(source[0]));
  const indices = String(order).split(',').map(v => parsePositiveNumber(v.trim(), 'Jede Seitenzahl') - 1);
  if (indices.length !== input.getPageCount() || new Set(indices).size !== indices.length || indices.some(i => i >= input.getPageCount())) throw new Error(`Bitte alle ${input.getPageCount()} Seiten genau einmal angeben, z. B. 2,1,3.`);
  const doc = await PDFDocument.create(); const pages = await doc.copyPages(input, indices); pages.forEach(page => doc.addPage(page)); const target = outputPath(outputDir, source[0], '-sortiert', 'pdf'); return [await writeOutput(target, await doc.save())];
}
async function compressPdf(source, outputDir, level) {
  requireFiles(source); const target = outputPath(outputDir, source[0], '-komprimiert', 'pdf');
  const ghostscript = await findExecutable(['gswin64c.exe', 'gswin32c.exe']);
  if (ghostscript && level !== 'lossless') {
    const output = await prepareOutput(target);
    const setting = level === 'small' ? '/screen' : '/ebook';
    const imageSettings = level === 'small'
      ? ['-dDownsampleColorImages=true', '-dColorImageDownsampleType=/Bicubic', '-dColorImageResolution=96', '-dDownsampleGrayImages=true', '-dGrayImageDownsampleType=/Bicubic', '-dGrayImageResolution=96', '-dJPEGQ=55']
      : ['-dDownsampleColorImages=true', '-dColorImageDownsampleType=/Bicubic', '-dColorImageResolution=150', '-dDownsampleGrayImages=true', '-dGrayImageDownsampleType=/Bicubic', '-dGrayImageResolution=150', '-dJPEGQ=75'];
    await execFileAsync(ghostscript, ['-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4', `-dPDFSETTINGS=${setting}`, ...imageSettings, '-dNOPAUSE', '-dQUIET', '-dBATCH', `-sOutputFile=${output}`, source[0]], { windowsHide: true, timeout: 180000 });
    return [output];
  } else {
    const pdf = await PDFDocument.load(await fs.readFile(source[0])); return [await writeOutput(target, await pdf.save({ useObjectStreams: true }))];
  }
}
async function runJob({ tool, files, outputDir, options = {}, conflictStrategy = 'rename', language = 'de' }) {
  const previousSettings = activeJobSettings; activeJobSettings = { conflictStrategy, language };
  try {
    requireOutputDir(outputDir); requireFiles(files); await fs.mkdir(outputDir, { recursive: true });
    if (tool === 'to-pdf') return await convertToPdf(files, outputDir, options);
    if (tool === 'from-pdf') return await exportPdf(files[0], outputDir, options.format || 'txt');
    if (tool === 'merge') return await mergePdfs(files, outputDir);
    if (tool === 'split') return await splitPdf(files, outputDir, options.splitAfter);
    if (tool === 'reorder') return await reorderPdf(files, outputDir, options.order);
    if (tool === 'compress') return await compressPdf(files, outputDir, options.level || 'lossless');
    throw new Error('Unbekanntes Werkzeug.');
  } finally { activeJobSettings = previousSettings; }
}

module.exports = { convertToPdf, exportPdf, mergePdfs, splitPdf, reorderPdf, compressPdf, runJob };
