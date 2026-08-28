function updateWorkflow() {
  const config = toolConfig();
  const hasFiles = state.files.length >= (config.minFiles || 1);
  const steps = {
    files: hasFiles,
    options: hasFiles && state.optionValid,
    destination: Boolean(state.outputDir),
  };
  const activeStep = !hasFiles
    ? "files"
    : !state.optionValid
      ? "options"
      : !state.outputDir
        ? "destination"
        : null;
  document.querySelectorAll("#workflow-status li").forEach((item) => {
    const done = steps[item.dataset.step];
    const active = item.dataset.step === activeStep;
    item.classList.toggle("is-complete", done);
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
}
function refreshRunButton() {
  const config = toolConfig();
  const hasFiles = state.files.length >= (config.minFiles || 1);
  $("#run-button").disabled =
    !hasFiles || !state.optionValid || !state.outputDir || state.running;
  updateWorkflow();
}
function hideResult() {
  const panel = $("#result-panel");
  panel.hidden = true;
  panel.replaceChildren();
}
function displayResult(kind, title, message, files = []) {
  const panel = $("#result-panel");
  panel.hidden = false;
  panel.className = `result-panel ${kind}`;
  panel.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = title;
  const text = document.createElement("p");
  text.textContent = message;
  panel.append(heading, text);
  if (files.length > 1)
    panel.append(
      makeButton(t("destinationOpen"), "result-file", () =>
        window.pdfWerkstatt.openFolder(state.outputDir),
      ),
    );
  files.forEach((file) =>
    panel.append(
      makeButton(
        `${t("showInExplorer")}: ${fileName(file)}`,
        "result-file",
        () => window.pdfWerkstatt.revealFile(file),
      ),
    ),
  );
}
