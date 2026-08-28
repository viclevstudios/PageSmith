// Event wiring lives separately so the rendering code stays side-effect free.
$("#choose-files").addEventListener("click", chooseFiles);
$("#choose-folder").addEventListener("click", chooseFolder);
$("#run-button").addEventListener("click", run);
$("#reset-page").addEventListener("click", resetCurrentPage);
function mountConflictSelect() {
  const conflictHost = $("#conflict-select");
  conflictHost.replaceWith(
    makeCustomSelect(
      "conflict-select",
      [
        ["rename", t("renameConflicts")],
        ["overwrite", t("overwriteConflicts")],
      ],
      state.conflictStrategy,
      (value) => {
        state.conflictStrategy = value;
        localStorage.setItem("pagesmith-pdf-conflict-strategy", value);
      },
    ),
  );
}
const languageHost = $("#language-select");
languageHost.replaceWith(
  makeCustomSelect(
    "language-select",
    [
      ["de", "Deutsch"],
      ["en", "English"],
    ],
    state.language,
    (value) => {
      state.language = value;
      localStorage.setItem("pdf-werkstatt-language", state.language);
      mountConflictSelect();
      render();
    },
  ),
);
mountConflictSelect();
document.addEventListener("click", (event) => {
  if (!event.target.closest(".custom-select")) closeCustomSelects();
});
const dropZone = $("#drop-zone");
["dragenter", "dragover"].forEach((type) =>
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  }),
);
["dragleave", "drop"].forEach((type) =>
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  }),
);
dropZone.addEventListener("drop", async (event) => {
  const files = [...event.dataTransfer.files]
    .map((file) => window.pdfWerkstatt.getPathForFile(file))
    .filter(Boolean);
  await addFiles(files);
});
render();
window.pdfWerkstatt.getDefaultOutputFolder().then((folder) => {
  if (!state.outputDir && folder) {
    state.outputDir = folder;
    render();
  }
});
