// Shared DOM primitives keep the rendering files focused on their content.
function moveItem(items, from, to) {
  if (to < 0 || to >= items.length || from === to) return;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
}
function makeButton(label, className, handler, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", handler);
  return button;
}
function makeRemoveButton(label, handler) {
  const button = makeButton("", "remove-file", handler);
  button.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"/><path d="M10 11v6M14 11v6"/><path d="m9 7 .7-2h4.6l.7 2"/><path d="M7 7l.8 13h8.4L17 7"/></svg>';
  button.setAttribute("aria-label", label);
  button.title = label;
  return button;
}
function closeCustomSelects(except) {
  document.querySelectorAll(".custom-select.is-open").forEach((select) => {
    if (select !== except) {
      select.classList.remove("is-open");
      select
        .querySelector(".custom-select-trigger")
        .setAttribute("aria-expanded", "false");
    }
  });
}
function makeCustomSelect(id, items, initialValue, onChange = () => {}) {
  const root = document.createElement("div");
  root.id = id;
  root.className = "custom-select";
  root.dataset.value = initialValue;
  root.setAttribute("role", "group");
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const text = document.createElement("span");
  text.className = "custom-select-value";
  const chevron = document.createElement("span");
  chevron.className = "custom-select-chevron";
  chevron.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5"/></svg>';
  trigger.append(text, chevron);
  const menu = document.createElement("div");
  menu.className = "custom-select-menu";
  menu.setAttribute("role", "listbox");
  const setValue = (value, notify = true) => {
    const choice = items.find((item) => item[0] === value) || items[0];
    root.dataset.value = choice[0];
    text.textContent = choice[1];
    menu.querySelectorAll("[role=option]").forEach((option) => {
      const selected = option.dataset.value === choice[0];
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-selected", String(selected));
    });
    if (notify) onChange(choice[0]);
  };
  items.forEach(([value, label]) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "custom-select-option";
    option.dataset.value = value;
    option.setAttribute("role", "option");
    option.addEventListener("click", () => {
      setValue(value);
      root.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    });
    option.addEventListener("keydown", (event) => {
      const options = [...menu.querySelectorAll(".custom-select-option")];
      const position = options.indexOf(option);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        options[(position + 1) % options.length].focus();
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        options[(position - 1 + options.length) % options.length].focus();
      }
      if (event.key === "Escape") {
        root.classList.remove("is-open");
        trigger.setAttribute("aria-expanded", "false");
        trigger.focus();
      }
    });
    option.textContent = label;
    menu.append(option);
  });
  const toggle = () => {
    const opening = !root.classList.contains("is-open");
    closeCustomSelects(root);
    root.classList.toggle("is-open", opening);
    trigger.setAttribute("aria-expanded", String(opening));
  };
  trigger.addEventListener("click", toggle);
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!root.classList.contains("is-open")) toggle();
      const options = [...menu.querySelectorAll(".custom-select-option")];
      options[event.key === "ArrowDown" ? 0 : options.length - 1].focus();
    }
    if (event.key === "Escape") {
      root.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
    }
  });
  root.append(trigger, menu);
  setValue(initialValue, false);
  return root;
}
