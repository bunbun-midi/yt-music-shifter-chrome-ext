// Volume, pitch, and tape-speed panel.
// The player-bar slider stays a pitch-preserving speed control. Pitch shifts
// by semitones. Tape speed multiplies that rate and lets the pitch follow.

(() => {
  const PANEL_ID = "ytm-extension-audio-panel";
  const SETTINGS_KEY = "ytm_audio_settings";
  const LAYOUT_KEY = "ytm_audio_layout";

  if (document.getElementById(PANEL_ID)) return;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const signed = (value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

  let volume = 1;
  let muted = false;
  let volumeTouched = false;
  let semitones = 0;
  let varispeed = 1;
  let tempo = 1;
  let tempoListener = null;

  function playerVideo() {
    return document.querySelector("ytmusic-player video") || document.querySelector("video");
  }

  function baseTempo() {
    const n = Number(tempo);
    if (!Number.isFinite(n)) return 1;
    return Math.round(clamp(n, 0.1, 1.6) * 100) / 100;
  }

  function rateFor(base) {
    const tempoValue = base === undefined ? baseTempo() : Math.round(clamp(Number(base), 0.1, 1.6) * 100) / 100;
    const rate = tempoValue * varispeed * Math.pow(2, semitones / 12);
    return Math.round(clamp(rate, 0.0625, 16) * 1000) / 1000;
  }

  function pitchFollowsSpeed() {
    return Math.abs(semitones) >= 0.001 || Math.abs(varispeed - 1) >= 0.0005;
  }

  function element(tag, attributes = {}, text) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      node.setAttribute(name, String(value));
    }
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, attributes = {}) {
    return element("button", { type: "button", ...attributes }, text);
  }

  const host = element("div", { id: PANEL_ID });
  host.style.cssText = `
    position: fixed !important;
    left: 8px !important;
    top: 8px !important;
    right: auto !important;
    bottom: auto !important;
    z-index: 2147483646 !important;
    max-width: none !important;
  `;

  const root = host.attachShadow({ mode: "open" });
  const style = element("style");
  style.textContent = `
    :host { color-scheme: dark; }
    * { box-sizing: border-box; }
    .panel {
      position: relative;
      display: flex;
      flex-direction: column;
      width: 360px;
      overflow: hidden;
      border: 1px solid #ffffff30;
      border-radius: 12px;
      background: #17191ff5;
      color: white;
      box-shadow: 0 4px 22px #0006;
      font: 13px/1.4 system-ui, sans-serif;
    }
    .heading {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 42px;
      padding: 8px 10px 8px 14px;
      border-bottom: 1px solid #ffffff18;
      color: #d7e0eb;
      font-size: 12px;
      cursor: grab;
      touch-action: none;
      user-select: none;
    }
    .heading.dragging { cursor: grabbing; }
    .title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 14px 14px 20px; scrollbar-width: thin; }
    .row { display: flex; align-items: center; gap: 8px; }
    .section { margin-top: 12px; padding-top: 12px; border-top: 1px solid #ffffff25; }
    label { flex: 0 0 45px; font-size: 12px; }
    input[type="range"] {
      flex: 1; min-width: 0; width: 100%; margin: 0; accent-color: #65d9ed; cursor: pointer;
    }
    input:disabled { opacity: .45; cursor: not-allowed; }
    output { flex: 0 0 48px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    button {
      flex-shrink: 0; height: 30px; padding: 0 8px; border: 0; border-radius: 6px;
      background: #ffffff15; color: white; font: inherit; cursor: pointer;
    }
    button:hover:not(:disabled) { background: #ffffff29; }
    button:disabled { opacity: .45; cursor: default; }
    button:focus-visible, input:focus-visible, .resize:focus-visible {
      outline: 2px solid #65d9ed; outline-offset: 2px;
    }
    .reset { font-size: 11px; }
    .mute { width: 34px; padding: 0; font-size: 18px; }
    .minimize { width: 28px; height: 26px; padding: 0; font-size: 17px; line-height: 1; }
    .enable { width: 100%; margin-bottom: 10px; font-size: 12px; }
    .presets { display: grid; gap: 6px; margin-top: 11px; }
    .preset-row { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 3px; }
    .preset { width: 100%; min-width: 0; height: 28px; padding: 0; font-size: 10px; font-variant-numeric: tabular-nums; }
    .preset[aria-pressed="true"] { background: #65d9ed; color: #10151c; }
    .preset[aria-pressed="true"]:hover:not(:disabled) { background: #8ce8f7; }
    .note { margin-top: 8px; color: #aab5c4; font-size: 11px; overflow-wrap: anywhere; }
    .footer { display: flex; justify-content: space-between; gap: 8px; margin-top: 10px; color: #aab5c4; font-size: 11px; }
    .speed { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .resize {
      position: absolute; right: 0; bottom: 0; width: 18px; height: 18px;
      cursor: nwse-resize; touch-action: none;
      background: repeating-linear-gradient(135deg, transparent 0 3px, #ffffff65 3px 4px, transparent 4px 6px);
      clip-path: polygon(100% 0, 100% 100%, 0 100%);
    }
    .panel.minimized .body, .panel.minimized .resize { display: none; }
    .panel.minimized .heading { border-bottom: 0; }
  `;

  const panel = element("section", {
    class: "panel",
    "aria-label": "YouTube Music audio controls"
  });
  const heading = element("div", { class: "heading" });
  const title = element("span", { class: "title" }, "YouTube Music · Audio Controls");
  const minimizeButton = button("−", { class: "minimize", "aria-controls": "ytm-controls-body" });
  heading.append(title, minimizeButton);

  const body = element("div", { class: "body", id: "ytm-controls-body" });
  const volumeRow = element("div", { class: "row" });
  const muteButton = button("🔊", { class: "mute", "aria-label": "Mute" });
  const volumeSlider = element("input", {
    type: "range", min: 0, max: 100, step: 1, "aria-label": "Volume"
  });
  const volumeValue = element("output");
  volumeRow.append(muteButton, volumeSlider, volumeValue);
  body.appendChild(volumeRow);

  function sliderRow(id, labelText, min, max, step, ariaLabel) {
    const row = element("div", { class: "row" });
    const label = element("label", { for: id }, labelText);
    const slider = element("input", {
      id, type: "range", min, max, step, "aria-label": ariaLabel
    });
    const output = element("output", { for: id });
    const reset = button("Reset", { class: "reset" });
    row.append(label, slider, output, reset);
    return { row, slider, output, reset };
  }

  function note(text) {
    return element("div", { class: "note" }, text);
  }

  const pitchSection = element("div", { class: "section" });
  const pitch = sliderRow(
    "ytm-turntable-pitch", "Pitch", -12, 12, 0.1,
    "Pitch in semitones"
  );
  const presets = element("div", {
    class: "presets",
    role: "group",
    "aria-label": "Pitch semitone presets"
  });
  const presetButtons = [];

  for (const direction of [1, -1]) {
    const row = element("div", { class: "preset-row" });
    for (let amount = 1; amount <= 12; amount += 1) {
      const value = direction * amount;
      const label = `${value > 0 ? "+" : "−"}${amount}`;
      const preset = button(label, {
        class: "preset",
        title: `Set pitch to ${label} semitones`,
        "aria-label": `Set pitch to ${label} semitones`,
        "aria-pressed": "false"
      });
      preset.addEventListener("click", () => setPitch(value));
      presetButtons.push({ button: preset, value });
      row.appendChild(preset);
    }
    presets.appendChild(row);
  }

  const tape = sliderRow(
    "ytm-varispeed", "Tape", 0.5, 1.5, 0.01,
    "Playback speed with pitch change"
  );
  tape.row.classList.add("section");
  const status = element("span");
  const speedValue = element("span", { class: "speed" });
  const footer = element("div", { class: "footer" });
  footer.append(status, speedValue);
  pitchSection.append(
    pitch.row,
    presets,
    note("Pitch in semitones. The buttons set this slider."),
    tape.row,
    note("Tape slows or speeds the song and the pitch together. At 1.00× the player-bar speed keeps its own pitch."),
    footer
  );
  body.appendChild(pitchSection);

  const resizeHandle = element("div", {
    class: "resize",
    tabindex: 0,
    role: "button",
    "aria-label": "Resize panel. Use arrow keys or drag.",
    title: "Drag to resize; arrow keys also work"
  });
  panel.append(heading, body, resizeHandle);
  root.append(style, panel);

  let minimized = false;
  let expandedWidth = 360;
  let expandedHeight = null;
  let dragState = null;
  let resizeState = null;
  let layoutTimer;
  const margin = 8;

  function viewport() {
    return {
      width: Math.max(1, window.innerWidth),
      height: Math.max(1, window.innerHeight)
    };
  }

  function setPosition(left, top) {
    const view = viewport();
    const rect = panel.getBoundingClientRect();
    host.style.setProperty(
      "left",
      `${clamp(left, margin, Math.max(margin, view.width - rect.width - margin))}px`,
      "important"
    );
    host.style.setProperty(
      "top",
      `${clamp(top, margin, Math.max(margin, view.height - rect.height - margin))}px`,
      "important"
    );
  }

  function fitLayout() {
    const view = viewport();
    const maxWidth = Math.max(1, view.width - margin * 2);
    const maxHeight = Math.max(1, view.height - margin * 2);
    panel.style.minWidth = `${Math.min(280, maxWidth)}px`;
    panel.style.width = `${clamp(expandedWidth, Math.min(280, maxWidth), maxWidth)}px`;
    panel.style.maxHeight = `${maxHeight}px`;
    panel.classList.toggle("minimized", minimized);
    panel.style.height = minimized || expandedHeight === null
      ? "auto"
      : `${clamp(expandedHeight, Math.min(140, maxHeight), maxHeight)}px`;
    minimizeButton.textContent = minimized ? "+" : "−";
    minimizeButton.title = minimized ? "Expand panel" : "Minimize panel";
    minimizeButton.setAttribute("aria-label", minimizeButton.title);
    minimizeButton.setAttribute("aria-expanded", String(!minimized));
    const left = parseFloat(host.style.left);
    const top = parseFloat(host.style.top);
    setPosition(Number.isFinite(left) ? left : margin, Number.isFinite(top) ? top : margin);
  }

  function saveLayout() {
    const rect = panel.getBoundingClientRect();
    chrome.storage.local.set({
      [LAYOUT_KEY]: {
        left: rect.left,
        top: rect.top,
        width: expandedWidth,
        height: expandedHeight,
        minimized
      }
    });
  }

  function saveSettings() {
    chrome.storage.local.set({
      [SETTINGS_KEY]: { volume, muted, volumeTouched, semitones, varispeed }
    });
  }

  minimizeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    minimized = !minimized;
    fitLayout();
    saveLayout();
  });

  heading.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button") || dragState || resizeState) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top
    };
    heading.classList.add("dragging");
    heading.setPointerCapture(event.pointerId);
  });

  heading.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    setPosition(
      dragState.left + event.clientX - dragState.x,
      dragState.top + event.clientY - dragState.y
    );
  });

  function finishDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    dragState = null;
    heading.classList.remove("dragging");
    saveLayout();
  }

  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    heading.addEventListener(eventName, finishDrag);
  }

  function resizeTo(width, height) {
    const view = viewport();
    const rect = panel.getBoundingClientRect();
    const maxWidth = Math.max(1, view.width - rect.left - margin);
    const maxHeight = Math.max(1, view.height - rect.top - margin);
    expandedWidth = clamp(width, Math.min(280, maxWidth), maxWidth);
    expandedHeight = clamp(height, Math.min(140, maxHeight), maxHeight);
    fitLayout();
  }

  resizeHandle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || minimized || dragState || resizeState) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    resizeState = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height
    };
    resizeHandle.setPointerCapture(event.pointerId);
  });

  resizeHandle.addEventListener("pointermove", (event) => {
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    resizeTo(
      resizeState.width + event.clientX - resizeState.x,
      resizeState.height + event.clientY - resizeState.y
    );
  });

  function finishResize(event) {
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    resizeState = null;
    saveLayout();
  }

  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    resizeHandle.addEventListener(eventName, finishResize);
  }

  resizeHandle.addEventListener("keydown", (event) => {
    if (minimized) return;
    const delta = {
      ArrowLeft: [-10, 0],
      ArrowRight: [10, 0],
      ArrowUp: [0, -10],
      ArrowDown: [0, 10]
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    resizeTo(rect.width + delta[0], rect.height + delta[1]);
    saveLayout();
  });

  window.addEventListener("resize", () => {
    fitLayout();
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(saveLayout, 200);
  });

  for (const eventName of ["keydown", "keyup"]) {
    panel.addEventListener(eventName, (event) => event.stopPropagation());
  }

  function render() {
    const silent = muted || volume === 0;
    volumeSlider.value = String(Math.round(volume * 100));
    volumeValue.textContent = silent ? "0%" : `${Math.round(volume * 100)}%`;
    muteButton.textContent = silent ? "🔇" : "🔊";
    muteButton.title = silent ? "Unmute" : "Mute";
    muteButton.setAttribute("aria-label", muteButton.title);
    muteButton.setAttribute("aria-pressed", String(silent));

    pitch.slider.value = String(semitones);
    pitch.output.textContent = signed(semitones);
    pitch.slider.setAttribute("aria-valuetext", `${semitones.toFixed(1)} semitones`);

    tape.slider.value = String(varispeed);
    tape.output.textContent = `${varispeed.toFixed(2)}×`;
    tape.slider.setAttribute("aria-valuetext", `${varispeed.toFixed(2)} times speed with pitch`);

    for (const { button: preset, value } of presetButtons) {
      preset.setAttribute("aria-pressed", String(Math.abs(semitones - value) < 0.051));
    }

    status.textContent = playerVideo() ? "Player detected" : "Start a song to begin";
    speedValue.textContent = `${rateFor().toFixed(2)}× total speed`;
  }

  function apply(video) {
    const target = video || playerVideo();
    if (!target) {
      render();
      return;
    }

    if (volumeTouched) {
      try {
        if (Math.abs(target.volume - volume) > 0.001) target.volume = volume;
        if (target.muted !== muted) target.muted = muted;
      } catch (error) {
        // The player can reject volume changes during a track swap.
      }
    }

    const preserve = !pitchFollowsSpeed();
    try {
      for (const property of ["preservesPitch", "webkitPreservesPitch", "mozPreservesPitch"]) {
        if (property in target && target[property] !== preserve) target[property] = preserve;
      }
      const rate = rateFor();
      if (Math.abs(target.playbackRate - rate) > 0.0001) target.playbackRate = rate;
    } catch (error) {
      // Ignore transient media element failures.
    }

    render();
  }

  function setPitch(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    semitones = clamp(Math.round(numeric * 10) / 10, -12, 12);
    saveSettings();
    apply();
  }

  volumeSlider.addEventListener("input", () => {
    volume = Number(volumeSlider.value) / 100;
    muted = false;
    volumeTouched = true;
    saveSettings();
    apply();
  });

  muteButton.addEventListener("click", () => {
    volumeTouched = true;
    if (muted || volume === 0) {
      muted = false;
      if (volume === 0) volume = 1;
    } else {
      muted = true;
    }
    saveSettings();
    apply();
  });

  pitch.slider.addEventListener("input", () => setPitch(pitch.slider.value));
  pitch.reset.addEventListener("click", () => setPitch(0));

  tape.slider.addEventListener("input", () => {
    varispeed = Math.round(clamp(Number(tape.slider.value), 0.5, 1.5) * 100) / 100;
    saveSettings();
    apply();
  });

  tape.reset.addEventListener("click", () => {
    varispeed = 1;
    saveSettings();
    apply();
  });

  document.documentElement.appendChild(host);
  render();
  fitLayout();

  const initialRect = panel.getBoundingClientRect();
  setPosition(
    window.innerWidth - initialRect.width - 16,
    window.innerHeight - initialRect.height - 100
  );

  chrome.storage.local.get([SETTINGS_KEY, LAYOUT_KEY], (data) => {
    const settings = data[SETTINGS_KEY];
    if (settings && typeof settings === "object") {
      if (Number.isFinite(settings.volume)) volume = clamp(settings.volume, 0, 1);
      muted = settings.muted === true;
      volumeTouched = settings.volumeTouched === true;
      if (Number.isFinite(settings.semitones)) semitones = clamp(settings.semitones, -12, 12);
      if (Number.isFinite(settings.varispeed)) varispeed = Math.round(clamp(settings.varispeed, 0.5, 1.5) * 100) / 100;
    }
    const layout = data[LAYOUT_KEY];
    if (layout && typeof layout === "object") {
      minimized = layout.minimized === true;
      if (Number.isFinite(layout.width)) expandedWidth = layout.width;
      if (Number.isFinite(layout.height)) expandedHeight = layout.height;
      fitLayout();
      if (Number.isFinite(layout.left) && Number.isFinite(layout.top)) {
        setPosition(layout.left, layout.top);
      }
    }
    apply();
  });

  setInterval(() => apply(), 1000);

  globalThis.ytmAudio = {
    setTempo(value) {
      const next = Number(value);
      if (!Number.isFinite(next)) return;
      tempo = Math.round(clamp(next, 0.1, 1.6) * 100) / 100;
      render();
    },
    getTempo() {
      return baseTempo();
    },
    rateFor,
    apply,
    onTempo(listener) {
      tempoListener = listener;
    }
  };
})();
