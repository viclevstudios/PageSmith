const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { PDFDocument } = require("pdf-lib");
const { findExecutable } = require("./conversion");
const {
  outputPath,
  prepareOutput,
  requireFiles,
  writeOutput,
} = require("./runtime");

const execFileAsync = promisify(execFile);

// Page-level PDF changes deliberately preserve the original source file.
async function mergePdfs(files, outputDir) {
  requireFiles(files, 2);
  const result = await PDFDocument.create();
  for (const file of files) {
    const source = await PDFDocument.load(await fs.readFile(file));
    const pages = await result.copyPages(source, source.getPageIndices());
    pages.forEach((page) => result.addPage(page));
  }
  const target = path.join(outputDir, "PDF-zusammengefuegt.pdf");
  return [await writeOutput(target, await result.save())];
}
function parsePositiveNumber(value, description) {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`${description} muss eine positive Seitenzahl sein.`);
  return n;
}
async function splitPdf(source, outputDir, splitAfter) {
  requireFiles(source);
  const input = await PDFDocument.load(await fs.readFile(source[0]));
  const cuts = [
    ...new Set(
      String(splitAfter)
        .split(",")
        .map((value) => parsePositiveNumber(value.trim(), "Jede Trennstelle")),
    ),
  ].sort((a, b) => a - b);
  if (cuts.some((cut) => cut >= input.getPageCount()))
    throw new Error(
      `Die PDF hat nur ${input.getPageCount()} Seiten; alle Trennstellen müssen davor liegen.`,
    );
  const outputs = [];
  let start = 0;
  for (const [part, end] of [...cuts, input.getPageCount()].entries()) {
    const doc = await PDFDocument.create();
    const indices = [...Array(end - start).keys()].map(
      (index) => start + index,
    );
    const pages = await doc.copyPages(input, indices);
    pages.forEach((page) => doc.addPage(page));
    const target = outputPath(outputDir, source[0], `-Teil-${part + 1}`, "pdf");
    outputs.push(await writeOutput(target, await doc.save()));
    start = end;
  }
  return outputs;
}
async function reorderPdf(source, outputDir, order) {
  requireFiles(source);
  const input = await PDFDocument.load(await fs.readFile(source[0]));
  const indices = String(order)
    .split(",")
    .map((v) => parsePositiveNumber(v.trim(), "Jede Seitenzahl") - 1);
  if (
    indices.length !== input.getPageCount() ||
    new Set(indices).size !== indices.length ||
    indices.some((i) => i >= input.getPageCount())
  )
    throw new Error(
      `Bitte alle ${input.getPageCount()} Seiten genau einmal angeben, z. B. 2,1,3.`,
    );
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(input, indices);
  pages.forEach((page) => doc.addPage(page));
  const target = outputPath(outputDir, source[0], "-sortiert", "pdf");
  return [await writeOutput(target, await doc.save())];
}
async function compressPdf(source, outputDir, level) {
  requireFiles(source);
  const target = outputPath(outputDir, source[0], "-komprimiert", "pdf");
  const ghostscript = await findExecutable(["gswin64c.exe", "gswin32c.exe"]);
  if (ghostscript && level !== "lossless") {
    const output = await prepareOutput(target);
    const setting = level === "small" ? "/screen" : "/ebook";
    const imageSettings =
      level === "small"
        ? [
            "-dDownsampleColorImages=true",
            "-dColorImageDownsampleType=/Bicubic",
            "-dColorImageResolution=96",
            "-dDownsampleGrayImages=true",
            "-dGrayImageDownsampleType=/Bicubic",
            "-dGrayImageResolution=96",
            "-dJPEGQ=55",
          ]
        : [
            "-dDownsampleColorImages=true",
            "-dColorImageDownsampleType=/Bicubic",
            "-dColorImageResolution=150",
            "-dDownsampleGrayImages=true",
            "-dGrayImageDownsampleType=/Bicubic",
            "-dGrayImageResolution=150",
            "-dJPEGQ=75",
          ];
    await execFileAsync(
      ghostscript,
      [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        `-dPDFSETTINGS=${setting}`,
        ...imageSettings,
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        `-sOutputFile=${output}`,
        source[0],
      ],
      { windowsHide: true, timeout: 180000 },
    );
    return [output];
  } else {
    const pdf = await PDFDocument.load(await fs.readFile(source[0]));
    return [
      await writeOutput(target, await pdf.save({ useObjectStreams: true })),
    ];
  }
}

module.exports = { compressPdf, mergePdfs, reorderPdf, splitPdf };
