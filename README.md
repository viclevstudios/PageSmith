# PageSmith PDF

PageSmith PDF is a small side project of mine which I wanted to share publicly because why not. It's a local Windows 11 desktop application for converting and editing PDF files locally on your own computer.

## Features

- Convert TXT, images (png, jpg, jpeg), HTML, Markdown, Microsoft Office and OpenOffice files to PDF
- Export PDFs to TXT, editable DOCX, visual HTML, or Markdown (still WIP, doesn't work that well yet)
- Merge PDFs
- Split them at selected pages
- Reorder pages of existing PDFs
- Compress PDFs locally
- German and English user interface

## Todos
- improve the code architecture
- improve the compression feature
- improve PDF exports

## Requirements

- Windows 11 (64-bit)
- Node.js 22.13+ and npm 10+ for development (optional)
- Microsoft Office for DOC, DOCX, XLS, XLSX, PPT and PPTX conversion (optional)
- LibreOffice for ODT, ODS and ODP files, or as an Office-conversion fallback (optional)
- Ghostscript for stronger image compression (optional; not bundled)

## Development

```powershell
npm install
npm start
```

Run the checks and functional tests:

```powershell
npm run check
npm test
```

Build the Windows installer:

```powershell
npm run dist
```

## Privacy and security

All primary operations run locally. Office and OpenOffice conversion launches locally installed applications in headless mode. PageSmith PDF does not include telemetry, cloud storage, or network-based document processing.

Treat untrusted PDFs and office documents with the same care as any downloaded document. See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Compatibility notes

- Text-to-PDF conversion, PDF page operations, and TXT/DOCX export are covered by automated core-feature tests.
- Office conversion depends on the locally installed Microsoft Office or LibreOffice version and is documented as a manual compatibility check.
- Ghostscript is optional. Its licence must be reviewed before redistributing it with any derivative installer.

See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) and [docs/PERFORMANCE.md](docs/PERFORMANCE.md) for the tested scope and operating guidance.

## Package size

The Windows build intentionally includes Electron and local PDF rendering support so that documents can stay offline. Release builds package only the German and English Chromium language resources and omit unused PDF.js viewer, type, source-map, and duplicate build files. The native PDF rendering module remains included for page previews and visual exports.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before opening an issue or pull request.

## Licence

This project is released under the [MIT License](LICENSE).
