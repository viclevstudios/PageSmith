process.env.PAGESMITH_TEST = '1';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const overwriteDialogs = [];

const originalLoad = Module._load;
Module._load = function loadElectronForTests(request, parent, isMain) {
  if (request === 'electron') return {
    app: { getPath: () => os.tmpdir() },
    BrowserWindow: class BrowserWindow {},
    dialog: { showMessageBox: async (_window, options) => { overwriteDialogs.push(options); return { response: 1 }; } },
    ipcMain: { handle: () => {} },
    shell: {}
  };
  return originalLoad.call(this, request, parent, isMain);
};

async function pageCount(filePath) {
  return (await PDFDocument.load(await fs.readFile(filePath))).getPageCount();
}

async function createSamplePdf(filePath) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const text of ['Alpha page', 'Bravo page', 'Charlie page']) {
    const page = pdf.addPage([595, 842]);
    page.drawText(text, { x: 72, y: 760, size: 18, font });
  }
  await fs.writeFile(filePath, await pdf.save());
}

async function expectFile(filePath) {
  const stat = await fs.stat(filePath);
  assert.ok(stat.size > 0, `${path.basename(filePath)} should not be empty`);
}

async function run() {
  const startedAt = performance.now();
  const tools = require('../src/main.js');
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pagesmith-pdf-test-'));
  const input = path.join(workspace, 'input');
  const output = path.join(workspace, 'output');
  await fs.mkdir(input); await fs.mkdir(output);

  try {
    const textFile = path.join(input, 'note.txt');
    const sourcePdf = path.join(input, 'sample.pdf');
    const secondPdf = path.join(input, 'second.pdf');
    await fs.writeFile(textFile, 'A local text conversion test.\nSecond line.');
    await createSamplePdf(sourcePdf); await createSamplePdf(secondPdf);

    const converted = await tools.convertToPdf([textFile], output, { combine: 'separate' });
    await expectFile(converted[0]); assert.equal(await pageCount(converted[0]), 1, 'text conversion should create one PDF page');
    const renamed = await tools.convertToPdf([textFile], output, { combine: 'separate' });
    assert.match(path.basename(renamed[0]), /note \(1\)\.pdf$/, 'existing output should receive a numbered filename by default');
    await expectFile(renamed[0]);
    const merged = await tools.mergePdfs([sourcePdf, secondPdf], output);
    await expectFile(merged[0]); assert.equal(await pageCount(merged[0]), 6, 'merge should preserve every page');
    await assert.rejects(() => tools.runJob({ tool: 'merge', files: [sourcePdf, secondPdf], outputDir: output, conflictStrategy: 'overwrite', language: 'en' }), /The job was cancelled/);
    assert.deepEqual(overwriteDialogs.at(-1).buttons, ['Overwrite', 'Cancel'], 'overwrite dialog should follow the selected language');

    const split = await tools.splitPdf([sourcePdf], output, '1,2');
    assert.equal(split.length, 3, 'split should create one file per segment');
    await Promise.all(split.map(expectFile)); assert.deepEqual(await Promise.all(split.map(pageCount)), [1, 1, 1]);

    const reordered = await tools.reorderPdf([sourcePdf], output, '3,1,2');
    await expectFile(reordered[0]); assert.equal(await pageCount(reordered[0]), 3, 'reorder should keep all pages');
    await assert.rejects(() => tools.reorderPdf([sourcePdf], output, '1,1,2'), /genau einmal/);

    const compressed = await tools.compressPdf([sourcePdf], output, 'lossless');
    await expectFile(compressed[0]); assert.equal(await pageCount(compressed[0]), 3, 'lossless compression should preserve pages');

    const textExport = await tools.exportPdf(sourcePdf, output, 'txt');
    assert.match(await fs.readFile(textExport[0], 'utf8'), /Alpha page/, 'text export should contain PDF text');

    const wordExport = await tools.exportPdf(sourcePdf, output, 'docx');
    await expectFile(wordExport[0]);
    console.log(`All PageSmith PDF core-feature tests passed in ${(performance.now() - startedAt).toFixed(0)} ms.`);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
