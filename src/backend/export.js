const fs = require("node:fs/promises");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");
const { Document, Packer, Paragraph, TextRun, ImageRun } = require("docx");
const { escapeHtml, outputPath, safeStem, writeOutput } = require("./runtime");

/** Extracts readable text first, then uses page images where visual fidelity is required. */
async function extractPdfText(source) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await fs.readFile(source));
  const document = await pdfjs.getDocument({ data, disableWorker: true })
    .promise;
  const pages = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    const fragments = content.items
      .filter((item) => item.str && item.str.trim())
      .map((item) => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
      }));
    const lines = [];
    for (const fragment of fragments) {
      let line = lines.find(
        (candidate) => Math.abs(candidate.y - fragment.y) < 3,
      );
      if (!line) {
        line = { y: fragment.y, fragments: [] };
        lines.push(line);
      }
      line.fragments.push(fragment);
    }
    pages.push(
      lines
        .sort((a, b) => b.y - a.y)
        .map((line) =>
          line.fragments
            .sort((a, b) => a.x - b.x)
            .map((fragment) => fragment.text)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(Boolean)
        .join("\n"),
    );
  }
  return pages;
}
async function renderPdfPages(source) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = require("@napi-rs/canvas");
  const data = new Uint8Array(await fs.readFile(source));
  const document = await pdfjs.getDocument({ data, disableWorker: true })
    .promise;
  const rendered = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    await page.render({ canvasContext: canvas.getContext("2d"), viewport })
      .promise;
    rendered.push({
      data: canvas.toBuffer("image/png"),
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
    });
  }
  return rendered;
}
async function exportPdf(source, outputDir, format) {
  const pages = await extractPdfText(source);
  const text = pages.join("\n\n");
  const target = outputPath(outputDir, source, "", format);
  if (format === "txt") return [await writeOutput(target, text, "utf8")];
  if (format !== "txt") {
    const rendered = await renderPdfPages(source);
    if (format === "html")
      return [
        await writeOutput(
          target,
          `<!doctype html><html lang="de"><meta charset="utf-8"><title>${escapeHtml(safeStem(source))}</title><style>body{margin:0;background:#20242b}img{display:block;width:min(100%,1100px);margin:18px auto;background:white;box-shadow:0 3px 18px #0008}</style><body>${rendered.map((page, index) => `<img alt="Seite ${index + 1}" src="data:image/png;base64,${page.data.toString("base64")}">`).join("")}</body></html>`,
          "utf8",
        ),
      ];
    if (format === "md") {
      const assets = path.join(outputDir, `${safeStem(source)}-Seiten`);
      await fs.mkdir(assets, { recursive: true });
      const links = [];
      for (const [index, page] of rendered.entries()) {
        const name = `Seite-${index + 1}.png`;
        const saved = await writeOutput(path.join(assets, name), page.data);
        links.push(
          `![Seite ${index + 1}](${path.basename(assets)}/${path.basename(saved)})`,
        );
      }
      return [await writeOutput(target, links.join("\n\n"), "utf8")];
    }
    if (format === "docx") {
      const document = new Document({
        sections: [
          {
            children: pages.flatMap((pageText, index) => {
              const heading = new Paragraph({
                children: [
                  new TextRun({ text: `Seite ${index + 1}`, bold: true }),
                ],
                spacing: { after: 160 },
              });
              if (pageText.trim())
                return [
                  heading,
                  ...pageText.split("\n").map(
                    (textPart) =>
                      new Paragraph({
                        text: textPart,
                        spacing: { after: 70 },
                      }),
                  ),
                ];
              const page = rendered[index];
              return [
                heading,
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: page.data,
                      transformation: {
                        width: Math.min(page.width, 520),
                        height: Math.round(
                          (Math.min(page.width, 520) * page.height) /
                            page.width,
                        ),
                      },
                    }),
                  ],
                }),
              ];
            }),
          },
        ],
      });
      return [await writeOutput(target, await Packer.toBuffer(document))];
    }
  }
  throw new Error(`Nicht unterstütztes Ausgabeformat: ${format}.`);
}

module.exports = { exportPdf };
