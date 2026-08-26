# Contributing to PageSmith PDF

Thank you for contributing.

## Before opening a pull request

1. Create a focused branch from `main`.
2. Keep document processing local; do not add cloud upload or telemetry without prior discussion.
3. Run `npm run check` and `npm test`.
4. Describe the user-facing change and the manual checks performed.

## Development guidelines

- Preserve the Electron security model: context isolation stays enabled and Node integration stays disabled in the renderer.
- Do not add credentials, test documents with personal data, installers, or generated output to the repository.
- Keep optional integrations such as Microsoft Office, LibreOffice, and Ghostscript optional.
- Add or extend core tests for changed PDF operations whenever practical.

## Reporting defects

Use the bug-report template for reproducible defects. For security-sensitive reports, follow [SECURITY.md](SECURITY.md) instead.
