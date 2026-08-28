function makeOption(labelText, field, helper = "") {
  const group = document.createElement("div");
  group.className = "field";
  const text = document.createElement("span");
  text.textContent = labelText;
  field.setAttribute("aria-label", labelText);
  group.append(text, field);
  if (helper) {
    const note = document.createElement("small");
    note.textContent = helper;
    group.append(note);
  }
  return group;
}
function splitValidity(value) {
  if (!state.pageCount) return { valid: true, message: t("splitUnchecked") };
  const cuts = String(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map(Number);
  const valid =
    cuts.length > 0 &&
    cuts.every((x) => Number.isInteger(x) && x > 0 && x < state.pageCount) &&
    new Set(cuts).size === cuts.length;
  return {
    valid,
    message: valid
      ? t("splitResult", { count: cuts.length + 1 })
      : t("splitInvalid", { count: state.pageCount - 1 }),
  };
}
function renderPageOrder(area) {
  if (!state.pageCount) {
    const note = document.createElement("p");
    note.className = "inline-note";
    note.textContent = t("choosePdfOrder");
    area.append(note);
    return;
  }
  const note = document.createElement("p");
  note.className = "inline-note";
  note.textContent = `${state.pageCount} ${t("page").toLowerCase()}${state.pageCount === 1 ? "" : state.language === "en" ? "s" : "n"}. ${t("pageOrder")}`;
  const list = document.createElement("ol");
  list.className = "page-order-list";
  list.setAttribute("aria-label", t("newPageOrder"));
  area.append(note, list);
  state.pageOrder.forEach((page, index) => {
    const item = document.createElement("li");
    item.className = "page-chip";
    item.draggable = true;
    item.setAttribute(
      "aria-label",
      t("pagePosition", { page, position: index + 1 }),
    );
    item.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", index);
      item.classList.add("drag-source");
    });
    item.addEventListener("dragend", () =>
      item.classList.remove("drag-source"),
    );
    item.addEventListener("dragover", (event) => event.preventDefault());
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      moveItem(
        state.pageOrder,
        Number(event.dataTransfer.getData("text/plain")),
        index,
      );
      renderOptions();
    });
    const preview = new Image();
    preview.className = "page-thumbnail";
    preview.src = state.thumbnails[state.files[0]]?.[page - 1] || "";
    preview.alt = `${t("page")} ${page}`;
    const value = document.createElement("span");
    value.textContent = page;
    const controls = document.createElement("span");
    controls.className = "page-controls";
    controls.append(
      makeButton(
        t("earlier"),
        "move-button",
        () => {
          moveItem(state.pageOrder, index, index - 1);
          renderOptions();
        },
        index === 0,
      ),
      makeButton(
        t("later"),
        "move-button",
        () => {
          moveItem(state.pageOrder, index, index + 1);
          renderOptions();
        },
        index === state.pageOrder.length - 1,
      ),
    );
    item.append(preview, value, controls);
    list.append(item);
  });
}
function renderOptions() {
  const area = $("#options");
  area.replaceChildren();
  state.optionValid = true;
  if (state.tool === "to-pdf")
    area.append(
      makeOption(
        t("outputForMultiple"),
        makeCustomSelect(
          "combine-output",
          [
            ["single", t("combineSingle")],
            ["separate", t("combineSeparate")],
          ],
          "single",
        ),
        t("combineHelp"),
      ),
    );
  else if (state.tool === "from-pdf")
    area.append(
      makeOption(
        t("outputFormat"),
        makeCustomSelect(
          "format",
          [
            ["txt", t("textFile")],
            ["docx", t("wordFile")],
            ["html", t("webFile")],
            ["md", t("markdownFile")],
          ],
          "txt",
        ),
      ),
    );
  else if (state.tool === "split") {
    const input = document.createElement("input");
    input.id = "split-after";
    input.value = "1";
    input.placeholder = state.language === "en" ? "e.g. 3, 7" : "z. B. 3, 7";
    const feedback = document.createElement("p");
    feedback.className = "field-feedback";
    const validate = () => {
      const result = splitValidity(input.value);
      state.optionValid = result.valid;
      feedback.textContent = result.message;
      feedback.classList.toggle("invalid", !result.valid);
      refreshRunButton();
    };
    input.addEventListener("input", validate);
    area.append(makeOption(t("splitAfter"), input, t("splitHelp")), feedback);
    validate();
  } else if (state.tool === "reorder") renderPageOrder(area);
  else if (state.tool === "compress")
    area.append(
      makeOption(
        t("compression"),
        makeCustomSelect(
          "compress-level",
          [
            ["lossless", t("lossless")],
            ["balanced", t("balanced")],
            ["small", t("small")],
          ],
          "lossless",
        ),
        t("compressionHelp"),
      ),
    );
  else {
    const note = document.createElement("p");
    note.className = "inline-note";
    note.textContent = toolConfig().hint;
    area.append(note);
  }
}
