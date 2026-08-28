// These functions render state into the static application shell.
function renderStaticCopy() {
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  const reset = $("#reset-page");
  reset.title = t("reset");
  reset.setAttribute("aria-label", t("reset"));
  $("#workflow-status").setAttribute("aria-label", t("workflow"));
  $("#tool-nav").setAttribute(
    "aria-label",
    state.language === "en" ? "PDF tools" : "PDF-Werkzeuge",
  );
}
function setTool(id) {
  if (id === state.tool) return;
  state.tool = id;
  state.files = [];
  state.pageCount = null;
  state.pageOrder = [];
  state.optionValid = true;
  state.notice = "";
  render();
}
function renderNavigation() {
  const nav = $("#tool-nav");
  nav.replaceChildren();
  Object.keys(tools).forEach((id) => {
    const tool = toolConfig(id);
    const item = makeButton(
      tool.label,
      `nav-item ${id === state.tool ? "selected" : ""}`,
      () => setTool(id),
    );
    if (id === state.tool) item.setAttribute("aria-current", "page");
    nav.append(item);
  });
}
function renderFiles() {
  const config = toolConfig(),
    list = $("#file-list");
  $("#file-count").textContent =
    `${state.files.length} ${state.files.length === 1 ? (state.language === "en" ? "file" : "Datei") : state.language === "en" ? "files" : "Dateien"}`;
  if (!state.files.length) {
    list.className = "file-list empty";
    list.innerHTML = `<p>${t("noFiles")}</p>`;
    return;
  }
  list.className = "file-list";
  list.replaceChildren();
  const toolbar = document.createElement("div");
  toolbar.className = "file-list-toolbar";
  const label = document.createElement("p");
  label.textContent =
    state.tool === "merge" ? t("mergeOrder") : t("selectedFiles");
  toolbar.append(
    label,
    makeButton(t("clear"), "text-button", () => {
      state.files = [];
      state.pageCount = null;
      state.pageOrder = [];
      state.notice = t("selectionCleared");
      render();
    }),
  );
  list.append(toolbar);
  state.files.forEach((file, index) => {
    const row = document.createElement("div");
    row.className = `file-row ${state.tool === "merge" ? "merge-preview-row" : ""}`;
    row.setAttribute("role", "listitem");
    if (["merge", "to-pdf"].includes(state.tool)) {
      row.draggable = true;
      row.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", index);
        row.classList.add("drag-source");
      });
      row.addEventListener("dragend", () =>
        row.classList.remove("drag-source"),
      );
      row.addEventListener("dragover", (event) => event.preventDefault());
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        moveItem(
          state.files,
          Number(event.dataTransfer.getData("text/plain")),
          index,
        );
        renderFiles();
      });
    }
    const preview = document.createElement("div");
    preview.className = "file-preview";
    if (state.tool === "merge" && state.thumbnails[file]?.[0]) {
      const image = new Image();
      image.src = state.thumbnails[file][0];
      image.alt = t("preview", { name: fileName(file) });
      preview.append(image);
    } else preview.textContent = file.split(".").pop().toUpperCase();
    const type = document.createElement("span");
    type.className = "file-type";
    type.textContent = file.split(".").pop().toUpperCase();
    const name = document.createElement("span");
    name.className = "file-name";
    name.title = file;
    name.textContent = fileName(file);
    const controls = document.createElement("div");
    controls.className = "file-controls";
    if (["merge", "to-pdf"].includes(state.tool))
      controls.append(
        makeButton(
          t("up"),
          "move-button",
          () => {
            moveItem(state.files, index, index - 1);
            renderFiles();
          },
          index === 0,
        ),
        makeButton(
          t("down"),
          "move-button",
          () => {
            moveItem(state.files, index, index + 1);
            renderFiles();
          },
          index === state.files.length - 1,
        ),
      );
    controls.append(
      makeRemoveButton(t("removeFile", { name: fileName(file) }), () => {
        state.files.splice(index, 1);
        refreshPdfInfo().then(render);
      }),
    );
    row.append(preview, type, name, controls);
    list.append(row);
  });
  if (config.single && state.files.length > 1) state.files = [state.files[0]];
}
