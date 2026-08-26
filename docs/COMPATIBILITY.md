# Compatibility

## Supported platform

PageSmith PDF is developed and packaged for 64-bit Windows 11. The installer is built with Electron and NSIS.

## Built-in operations

The following local operations are automated by the core-feature suite: TXT-to-PDF conversion, PDF merge, split, reorder, lossless compression, TXT export, and DOCX export. Image conversion, HTML/Markdown rendering, and Office conversion remain manual compatibility checks.

HTML and Markdown rendering use Electron's local print-to-PDF engine. Their visual result depends on the local Chromium version supplied by Electron.

## Optional local applications

| Input | Preferred local application | Fallback |
| --- | --- | --- |
| DOC, DOCX, XLS, XLSX, PPT, PPTX, RTF | Microsoft Office | LibreOffice |
| ODT, ODS, ODP | LibreOffice | Microsoft Office where supported |
| Strong PDF image compression | Ghostscript | Built-in lossless optimization |

Office applications are not bundled. Test important office files on the target Windows installation before relying on a batch workflow.
