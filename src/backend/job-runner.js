const { convertToPdf } = require("./conversion");
const { exportPdf } = require("./export");
const {
  compressPdf,
  mergePdfs,
  reorderPdf,
  splitPdf,
} = require("./pdf-operations");
const {
  localiseError,
  requireFiles,
  requireOutputDir,
  setMainWindow,
  withJobSettings,
} = require("./runtime");

const handlers = {
  "to-pdf": (files, outputDir, options) =>
    convertToPdf(files, outputDir, options),
  "from-pdf": (files, outputDir, options) =>
    exportPdf(files[0], outputDir, options.format || "txt"),
  merge: (files, outputDir) => mergePdfs(files, outputDir),
  split: (files, outputDir, options) =>
    splitPdf(files, outputDir, options.splitAfter),
  reorder: (files, outputDir, options) =>
    reorderPdf(files, outputDir, options.order),
  compress: (files, outputDir, options) =>
    compressPdf(files, outputDir, options.level || "lossless"),
};

/** Coordinates validation, request-specific settings, and the selected PDF action. */
async function runJob({
  tool,
  files,
  outputDir,
  options = {},
  conflictStrategy = "rename",
  language = "de",
}) {
  requireOutputDir(outputDir);
  requireFiles(files);

  const handle = handlers[tool];
  if (!handle) throw new Error("Unbekanntes Werkzeug.");

  return withJobSettings({ conflictStrategy, language }, async () => {
    const fs = require("node:fs/promises");
    await fs.mkdir(outputDir, { recursive: true });
    return handle(files, outputDir, options);
  });
}

module.exports = {
  compressPdf,
  convertToPdf,
  exportPdf,
  localiseError,
  mergePdfs,
  reorderPdf,
  runJob,
  setMainWindow,
  splitPdf,
};
