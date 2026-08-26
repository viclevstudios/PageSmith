# Performance notes

PageSmith PDF processes documents locally and keeps heavyweight PDF rendering lazy:

- Page thumbnails are rendered only for merge and reorder previews.
- Visual HTML, Markdown, and image-only DOCX fallback export render pages sequentially to limit simultaneous memory use.
- PDF merge, split, and reorder copy PDF objects without rasterizing pages.
- Lossless compression reuses PDF objects; stronger compression runs Ghostscript only when it is installed and explicitly selected.

For very large, image-heavy, or scanned PDFs, rendering and DOCX/HTML/Markdown export can take noticeable time and use more memory. Prefer TXT export, merge, split, reorder, or lossless compression when visual page rendering is not needed. Close other large applications before processing long scans.
