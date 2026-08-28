// File selection enriches state with page data before the UI is rendered again.
async function refreshPdfInfo() {
  if (!["split", "reorder"].includes(state.tool) || !state.files[0]) {
    state.pageCount = null;
    state.pageOrder = [];
    return;
  }
  try {
    const info = await window.pdfWerkstatt.getPdfInfo(state.files[0]);
    state.pageCount = info.pageCount;
    state.pageOrder = [...Array(info.pageCount).keys()].map(
      (index) => index + 1,
    );
    const previews = await window.pdfWerkstatt.getPdfThumbnails(
      state.files[0],
      state.pageOrder,
    );
    state.thumbnails[state.files[0]] = previews.map((item) => item.dataUrl);
    state.notice = t("pagesFound", { count: info.pageCount });
  } catch {
    state.pageCount = null;
    state.pageOrder = [];
    state.notice = t("pagesReadFailed");
  }
}
async function refreshMergeThumbnails() {
  if (state.tool !== "merge") return;
  await Promise.all(
    state.files.map(async (file) => {
      try {
        const previews = await window.pdfWerkstatt.getPdfThumbnails(file, [1]);
        state.thumbnails[file] = previews.map((item) => item.dataUrl);
      } catch {
        state.thumbnails[file] = [];
      }
    }),
  );
}
async function addFiles(files) {
  if (!files.length) return;
  const config = toolConfig();
  state.files = config.single
    ? [files[0]]
    : [...state.files, ...files.filter((file) => !state.files.includes(file))];
  state.notice = "";
  await refreshPdfInfo();
  await refreshMergeThumbnails();
  render();
}
async function chooseFiles() {
  await addFiles(
    await window.pdfWerkstatt.selectFiles(tools[state.tool].filter),
  );
}
async function chooseFolder() {
  const folder = await window.pdfWerkstatt.selectOutputFolder();
  if (!folder) return;
  state.outputDir = folder;
  state.notice = "";
  render();
  hideResult();
}
function currentOptions() {
  if (state.tool === "to-pdf")
    return { combine: $("#combine-output").dataset.value };
  if (state.tool === "from-pdf") return { format: $("#format").dataset.value };
  if (state.tool === "split") return { splitAfter: $("#split-after").value };
  if (state.tool === "reorder") return { order: state.pageOrder.join(",") };
  if (state.tool === "compress")
    return { level: $("#compress-level").dataset.value };
  return {};
}
async function run() {
  state.running = true;
  refreshRunButton();
  $("#run-button").textContent = t("processing");
  hideResult();
  try {
    const files = await window.pdfWerkstatt.runJob({
      tool: state.tool,
      files: state.files,
      outputDir: state.outputDir,
      options: currentOptions(),
      conflictStrategy: state.conflictStrategy,
      language: state.language,
    });
    displayResult(
      "success",
      t("done"),
      `${files.length} ${files.length === 1 ? t("fileCreated") : t("filesCreated")}`,
      files,
    );
  } catch (error) {
    const message = (error.message || t("unknown")).replace(
      /^Error invoking remote method 'run-job': Error: /,
      "",
    );
    displayResult("error", t("failed"), message);
  } finally {
    state.running = false;
    $("#run-button").textContent = toolConfig().action;
    refreshRunButton();
  }
}
function render() {
  const config = toolConfig();
  renderStaticCopy();
  renderNavigation();
  $("#tool-title").textContent = config.title;
  $("#tool-description").textContent = config.description;
  $("#drop-copy").textContent = config.single
    ? t("chooseOnePdf")
    : t("dropCopy");
  $("#choose-files").textContent = config.single
    ? t("choosePdf")
    : t("chooseFiles");
  $("#run-hint").textContent = config.hint;
  $("#run-button").textContent = config.action;
  $("#option-summary").textContent = "";
  $("#destination-path").textContent = state.outputDir || t("noFolder");
  $(".options-card").classList.toggle("is-muted", !state.files.length);
  renderFiles();
  renderOptions();
  refreshRunButton();
  hideResult();
}
async function resetCurrentPage() {
  state.files = [];
  state.pageCount = null;
  state.pageOrder = [];
  state.optionValid = true;
  state.notice = "";
  state.outputDir = await window.pdfWerkstatt.getDefaultOutputFolder();
  render();
}
