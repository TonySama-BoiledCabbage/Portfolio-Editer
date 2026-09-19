/* YUNSTUDIO whiteboard — local layout sandbox.
   An infinite canvas of page frames, each rendering the portfolio's own grid and
   type scale. Reads nothing from, and writes nothing to, content/*.json. */
(() => {
  "use strict";

  const STORE_KEY = "yunstudio-whiteboard-v2";
  const HISTORY_MAX = 80;

  /* ==========================================================
     SPEC — shipped values, mirrored only as "reset to spec" targets.
     css/grid-system.css owns the grid; css/styles.css owns the type scale.
     ========================================================== */
  const SPEC_GRID = { cols: 12, margin: 48, gutter: 32, baseline: 8 };

  const LEVELS = [
    { key: "display", cn: "主张",   min: 36, base: 0,  vw: 4.5, max: 72, weight: 400, lh: 1.12, ls: -0.03 },
    { key: "page",    cn: "页面题", min: 32, base: 0,  vw: 3.2, max: 52, weight: 400, lh: 1.08, ls: -0.035 },
    { key: "project", cn: "项目题", min: 24, base: 0,  vw: 2.8, max: 34, weight: 400, lh: 1.18, ls: -0.006 },
    { key: "lead",    cn: "导语",   min: 20, base: 0,  vw: 2.1, max: 30, weight: 400, lh: 1.5,  ls: 0 },
    { key: "chapter", cn: "章节题", min: 20, base: 0,  vw: 2.0, max: 26, weight: 400, lh: 1.2,  ls: -0.02 },
    { key: "card",    cn: "卡片题", min: 18, base: 0,  vw: 1.5, max: 22, weight: 500, lh: 1.3,  ls: -0.015 },
    { key: "body",    cn: "正文",   min: 16, base: 15, vw: 0.2, max: 18, weight: 400, lh: 1.65, ls: 0 },
    { key: "meta",    cn: "辅助",   min: 14, base: 0,  vw: 0,   max: 14, weight: 400, lh: 1.5,  ls: 0 },
    { key: "label",   cn: "标签",   min: 12, base: 0,  vw: 0,   max: 12, weight: 400, lh: 1.2,  ls: 0.08 }
  ];
  const LEVEL_KEYS = LEVELS.map(l => l.key);

  const FRAME_PRESETS = [
    { name: "桌面 1440", w: 1440, h: 1600 },
    { name: "宽屏 1600", w: 1600, h: 1600 },
    { name: "断点 1200", w: 1200, h: 1400 },
    { name: "平板 1000", w: 1000, h: 1300 },
    { name: "窄屏 720", w: 720, h: 1200 },
    { name: "手机 390", w: 390, h: 844 }
  ];

  const HEADER_SPEC = { on: true, top: 0, sticky: false, rule: true, brand: true, tools: true, custom: false, pad: 14, navJustify: "center" };
  const FOOTER_SPEC = {
    on: true, bottom: 0, rule: true, tools: true, custom: false,
    leftText: "© YUNTAO LU", rightText: "HANGZHOU & TORONTO, 2020—2026.",
    preset: "spec", lStart: 1, lSpan: 4, rStart: 5, rSpan: 4, rJustify: "start", pad: 32, stacked: false
  };
  const FOOTER_PRESETS = {
    spec:   { lStart: 1, lSpan: 4, rStart: 5, rSpan: 4, rJustify: "start",  stacked: false },
    ends:   { lStart: 1, lSpan: 4, rStart: 9, rSpan: 4, rJustify: "end",    stacked: false },
    stack:  { lStart: 1, lSpan: 6, rStart: 1, rSpan: 6, rJustify: "start",  stacked: true },
    center: { lStart: 3, lSpan: 4, rStart: 7, rSpan: 4, rJustify: "center", stacked: false }
  };

  const RATIOS = { "16:9": 16 / 9, "4:3": 4 / 3, "3:2": 3 / 2, "1:1": 1, "2:3": 2 / 3, "3:4": 3 / 4, "4:5": 4 / 5 };
  const EL_CN = { text: "文字", rect: "矩形", ellipse: "椭圆", line: "直线", image: "空图位" };
  const DRAW_TOOLS = ["frame", "rect", "ellipse", "line", "text", "image"];

  /* ==========================================================
     UTILITIES
     ========================================================== */
  const clone = v => JSON.parse(JSON.stringify(v));
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const round = n => Math.round(n * 100) / 100;
  const $ = id => document.getElementById(id);

  let seq = 0;
  const uid = p => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

  function h(tag, props, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "value") node.value = v;
      else if (k === "checked") node.checked = Boolean(v);
      else node.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  const ICON = {
    frame: '<svg viewBox="0 0 16 16"><path d="M5 1v14M11 1v14M1 5h14M1 11h14"/></svg>',
    text: '<svg viewBox="0 0 16 16"><path d="M3 3h10M8 3v10M6 13h4"/></svg>',
    rect: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="1"/></svg>',
    ellipse: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/></svg>',
    line: '<svg viewBox="0 0 16 16"><path d="M3 13L13 3"/></svg>',
    image: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 10.5l3-3 3 3 2.5-2.5 3.5 3.5"/></svg>',
    eye: '<svg viewBox="0 0 16 16"><path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z"/><circle cx="8" cy="8" r="1.8"/></svg>',
    eyeOff: '<svg viewBox="0 0 16 16"><path d="M2 2l12 12M6.3 6.4A2 2 0 008 10a2 2 0 001.6-.8M4.2 4.4C2.3 5.7 1 8 1 8s2.6 4.5 7 4.5c1.2 0 2.2-.3 3.1-.7M13.4 10C14.5 9 15 8 15 8s-2.6-4.5-7-4.5c-.5 0-1 0-1.4.1"/></svg>'
  };

  /* ==========================================================
     STATE
     ========================================================== */
  const defaultType = () => Object.fromEntries(LEVELS.map(l =>
    [l.key, { min: l.min, base: l.base, vw: l.vw, max: l.max, weight: l.weight, lh: l.lh, ls: l.ls }]));

  const defaultState = () => ({
    version: 2,
    name: "未命名白板",
    grid: { followSpec: true, ...SPEC_GRID },
    type: defaultType(),
    frames: [],
    elements: [],
    view: {
      panX: 0, panY: 0, zoom: 1, tool: "pointer", shape: "rect",
      guides: true, baseline: false, snap: true, theme: "light",
      sampleText: "Selected Works 作品集"
    }
  });

  let state = defaultState();
  let selection = [];          // ids of frames or elements
  let editingId = null;        // element currently in text editing
  let history = [];
  let saveTimer = null;
  const runtime = new Map();   // frameId -> { wrap, iframe, doc, ready }
  let canvasHtml = null;       // frame document source, fetched once at boot

  /** The portfolio spec this tool renders against; it ships no copy of them. */
  const SPEC_SHEETS = ["../css/styles.css", "../css/grid-system.css"];

  const frameById = id => state.frames.find(f => f.id === id) || null;
  const elById = id => state.elements.find(e => e.id === id) || null;
  const nodeById = id => frameById(id) || elById(id);
  const isFrame = id => Boolean(frameById(id));
  const elementsOf = id => state.elements.filter(e => e.frameId === id);

  /* ==========================================================
     PERSISTENCE + HISTORY
     ========================================================== */
  function markSaved(dirty) {
    els.saveState.textContent = dirty ? "保存中…" : "已保存";
    els.saveState.classList.toggle("is-dirty", Boolean(dirty));
  }

  function save() {
    markSaved(true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
        markSaved(false);
      } catch (error) {
        els.saveState.textContent = "无法保存";
        els.saveState.classList.add("is-dirty");
      }
    }, 300);
  }

  function normalize(input) {
    const base = defaultState();
    if (!input || typeof input !== "object") return base;
    if (typeof input.name === "string") base.name = input.name;
    Object.assign(base.grid, input.grid || {});
    base.grid.followSpec = input.grid ? Boolean(input.grid.followSpec) : true;
    for (const key of LEVEL_KEYS) if (input.type && input.type[key]) Object.assign(base.type[key], input.type[key]);
    Object.assign(base.view, input.view || {});
    base.view.tool = "pointer";

    base.frames = (Array.isArray(input.frames) ? input.frames : []).map(f => ({
      id: f.id || uid("f"),
      name: typeof f.name === "string" ? f.name : "画框",
      x: num(f.x, 0), y: num(f.y, 0),
      w: clamp(num(f.w, 1440), 200, 4000), h: clamp(num(f.h, 1600), 200, 12000),
      header: { ...HEADER_SPEC, ...(f.header || {}) },
      footer: { ...FOOTER_SPEC, ...(f.footer || {}) }
    }));
    const ids = new Set(base.frames.map(f => f.id));
    base.elements = (Array.isArray(input.elements) ? input.elements : [])
      .filter(e => e && EL_CN[e.type] && ids.has(e.frameId))
      .map(e => ({ ...blankElement(e.type, e.frameId), ...e, id: e.id || uid("e") }));
    return base;
  }

  const snapshot = () => JSON.stringify({ name: state.name, grid: state.grid, type: state.type, frames: state.frames, elements: state.elements });

  function pushHistory() {
    const shot = snapshot();
    if (history[history.length - 1] === shot) return;
    history.push(shot);
    if (history.length > HISTORY_MAX) history.shift();
  }

  function undo() {
    const prev = history.pop();
    if (!prev) { toast("没有可撤销的操作"); return; }
    const parsed = JSON.parse(prev);
    Object.assign(state, parsed);
    selection = selection.filter(id => nodeById(id));
    editingId = null;
    renderAll();
    save();
  }

  /* ==========================================================
     GEOMETRY
     ========================================================== */
  const view = () => state.view;
  const toScreen = (wx, wy) => [wx * view().zoom + view().panX, wy * view().zoom + view().panY];
  const toWorld = (sx, sy) => [(sx - view().panX) / view().zoom, (sy - view().panY) / view().zoom];

  /** World rect of a node: frames are absolute, elements are frame-relative. */
  function worldRect(node) {
    if (!node) return null;
    if (node.frameId === undefined) return { x: node.x, y: node.y, w: node.w, h: node.h };
    const f = frameById(node.frameId);
    return f ? { x: f.x + node.x, y: f.y + node.y, w: node.w, h: node.h } : null;
  }

  const frameAt = (wx, wy) =>
    [...state.frames].reverse().find(f => wx >= f.x && wx <= f.x + f.w && wy >= f.y && wy <= f.y + f.h) || null;

  /** Effective column count for a frame — the spec's own breakpoints decide. */
  function gridOf(frameId) {
    const doc = runtime.get(frameId)?.doc;
    const g = state.grid;
    if (!doc) return { cols: g.cols, margin: g.margin, gutter: g.gutter, baseline: g.baseline };
    const cs = getComputedStyle(doc.documentElement);
    const read = (name, fallback) => {
      const value = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(value) ? value : fallback;
    };
    return {
      cols: Math.round(read("--grid-cols", g.cols)),
      margin: read("--grid-margin", g.margin),
      gutter: read("--grid-gutter", g.gutter),
      baseline: read("--grid-baseline", g.baseline)
    };
  }

  /** x positions of every column edge inside a frame, in frame-local px. */
  function columnEdges(frameId) {
    const f = frameById(frameId);
    if (!f) return [];
    const { cols, margin, gutter } = gridOf(frameId);
    const colW = (f.w - margin * 2 - gutter * (cols - 1)) / cols;
    const out = [];
    for (let i = 0; i < cols; i += 1) {
      const left = margin + i * (colW + gutter);
      out.push(left, left + colW);
    }
    return out;
  }

  /* ==========================================================
     ELEMENT FACTORY
     ========================================================== */
  function blankElement(type, frameId) {
    const common = { id: uid("e"), frameId, type, x: 0, y: 0, w: 200, h: 120, locked: false, hidden: false, name: "" };
    if (type === "text") return { ...common, w: 420, h: 60, level: "page", text: "标题", align: "left", color: "", autoHeight: true };
    if (type === "image") return { ...common, w: 320, h: 400, ratio: "4:5", label: "", showTag: true };
    if (type === "line") return { ...common, w: 320, h: 1, stroke: "#111111", strokeW: 1 };
    return { ...common, fill: "#e6e6e6", stroke: "#111111", strokeW: 0, radius: 0 };
  }

  const elementName = e =>
    e.name || (e.type === "text" ? (e.text || "文字").slice(0, 24) : e.type === "image" ? (e.label || "空图位") : EL_CN[e.type]);

  /* ==========================================================
     FRAME RUNTIME
     ========================================================== */
  function renderFrames() {
    const seen = new Set();
    for (const f of state.frames) {
      seen.add(f.id);
      let rt = runtime.get(f.id);
      if (!rt) {
        // srcdoc, not src: production sends frame-ancestors 'none' and
        // X-Frame-Options: DENY on every path, which would block a framed
        // HTTP response even same-origin. A srcdoc document has no response
        // headers, and inherits the page CSP, which allows same-origin CSS.
        const iframe = h("iframe", { title: f.name, scrolling: "no" });
        iframe.srcdoc = canvasHtml;
        const wrap = h("div", { class: "wb-frame", "data-id": f.id }, iframe);
        els.world.append(wrap);
        rt = { wrap, iframe, doc: null, ready: false };
        runtime.set(f.id, rt);
        iframe.addEventListener("load", () => {
          const doc = iframe.contentDocument;
          if (!doc || !doc.getElementById("wbLayer")) return;
          rt.doc = doc;
          rt.ready = true;
          bindFrameDoc(f.id, doc);
          applyFrameVars(f.id);
          renderElements(f.id);
          renderOverlay();
        });
      }
      rt.wrap.style.left = `${f.x}px`;
      rt.wrap.style.top = `${f.y}px`;
      rt.wrap.style.width = `${f.w}px`;
      rt.wrap.style.height = `${f.h}px`;
      if (rt.ready) applyFrameVars(f.id);
    }
    for (const [id, rt] of runtime) {
      if (seen.has(id)) continue;
      rt.wrap.remove();
      runtime.delete(id);
    }
  }

  function applyGlobalVars(doc) {
    const root = doc.documentElement;
    const g = state.grid;
    for (const name of ["--grid-cols", "--grid-margin", "--grid-gutter"]) root.style.removeProperty(name);
    if (!g.followSpec) {
      root.style.setProperty("--grid-cols", String(clamp(Math.round(g.cols), 2, 24)));
      root.style.setProperty("--grid-margin", `${clamp(num(g.margin, 48), 0, 400)}px`);
      root.style.setProperty("--grid-gutter", `${clamp(num(g.gutter, 32), 0, 200)}px`);
    }
    root.style.setProperty("--grid-baseline", `${clamp(num(g.baseline, 8), 2, 64)}px`);

    for (const key of LEVEL_KEYS) {
      const l = state.type[key];
      root.style.setProperty(`--type-${key}`, typeValue(l));
      root.style.setProperty(`--wb-w-${key}`, String(l.weight));
      root.style.setProperty(`--wb-lh-${key}`, String(l.lh));
      root.style.setProperty(`--wb-ls-${key}`, `${l.ls}em`);
    }
    root.dataset.theme = state.view.theme;

    const body = doc.body;
    body.dataset.guides = state.view.guides ? "on" : "off";
    body.dataset.baseline = state.view.baseline ? "on" : "off";
    body.dataset.tool = DRAW_TOOLS.includes(state.view.tool) ? "draw" : state.view.tool;
  }

  function typeValue(l) {
    if (l.min === l.max) return `${l.max}px`;
    const mid = l.base ? `calc(${l.base}px + ${l.vw}vw)` : `${l.vw}vw`;
    return `clamp(${l.min}px, ${mid}, ${l.max}px)`;
  }

  function applyFrameVars(frameId) {
    const rt = runtime.get(frameId);
    const f = frameById(frameId);
    if (!rt?.ready || !f) return;
    const doc = rt.doc;
    applyGlobalVars(doc);

    const root = doc.documentElement;
    const body = doc.body;
    const { header, footer } = f;

    body.dataset.header = header.on ? "on" : "off";
    body.dataset.headerRule = header.rule ? "on" : "off";
    body.dataset.headerBrand = header.brand ? "on" : "off";
    body.dataset.headerTools = header.tools ? "on" : "off";
    body.dataset.headerCustom = header.custom ? "on" : "off";
    root.style.setProperty("--wb-header-top", `${num(header.top, 0)}px`);
    root.style.setProperty("--wb-header-pad", `${clamp(num(header.pad, 14), 0, 120)}px`);
    root.style.setProperty("--wb-nav-justify", header.navJustify);

    body.dataset.footer = footer.on ? "on" : "off";
    body.dataset.footerRule = footer.rule ? "on" : "off";
    body.dataset.footerTools = footer.tools ? "on" : "off";
    body.dataset.footerCustom = footer.custom ? "on" : "off";
    root.style.setProperty("--wb-footer-bottom", `${num(footer.bottom, 0)}px`);
    root.style.setProperty("--wb-footer-pad", `${clamp(num(footer.pad, 32), 0, 200)}px`);

    const { cols } = gridOf(frameId);
    const line = (start, span) => {
      const s = clamp(Math.round(start), 1, cols);
      return `${s} / ${clamp(s + Math.round(span), s + 1, cols + 1)}`;
    };
    root.style.setProperty("--wb-footL", line(footer.lStart, footer.lSpan));
    root.style.setProperty("--wb-footR", line(footer.rStart, footer.rSpan));
    root.style.setProperty("--wb-footL-row", "1");
    root.style.setProperty("--wb-footR-row", footer.stacked ? "2" : "1");
    root.style.setProperty("--wb-footR-justify", footer.rJustify);
    root.style.setProperty("--wb-footR-align", footer.rJustify === "end" ? "right" : footer.rJustify === "center" ? "center" : "left");

    const left = doc.getElementById("footL");
    const right = doc.getElementById("footR");
    if (left) left.textContent = footer.leftText;
    if (right) right.textContent = footer.rightText;

    const guides = doc.getElementById("wbGuides");
    if (guides && guides.childElementCount !== cols) {
      guides.textContent = "";
      for (let i = 0; i < cols; i += 1) guides.append(doc.createElement("span"));
    }
  }

  /* ==========================================================
     ELEMENT RENDERING
     ========================================================== */
  function renderElements(frameId) {
    const rt = runtime.get(frameId);
    if (!rt?.ready) return;
    const layer = rt.doc.getElementById("wbLayer");
    layer.textContent = "";
    for (const e of elementsOf(frameId)) layer.append(buildElement(rt.doc, e));
    syncAutoHeights(frameId);
  }

  function buildElement(doc, e) {
    const node = doc.createElement("div");
    node.className = "wb-el";
    node.dataset.id = e.id;
    node.dataset.type = e.type;
    node.dataset.locked = String(Boolean(e.locked));
    node.dataset.hidden = String(Boolean(e.hidden));
    placeElement(node, e);

    if (e.type === "text") {
      node.dataset.level = e.level;
      node.dataset.empty = String(!e.text);
      node.style.setProperty("--wb-align", e.align);
      if (e.color) node.style.setProperty("--wb-color", e.color);
      const p = doc.createElement("p");
      p.className = "wb-text";
      p.dataset.placeholder = "文字";
      p.textContent = e.text;
      node.append(p);
    } else if (e.type === "image") {
      node.dataset.tag = e.showTag ? "on" : "off";
      const box = doc.createElement("div");
      box.className = "wb-img";
      const tag = doc.createElement("span");
      tag.className = "wb-img-tag";
      tag.textContent = e.label || `${Math.round(e.w)} × ${Math.round(e.h)}`;
      box.append(tag);
      node.append(box);
    } else {
      node.style.setProperty("--wb-fill", e.fill || "transparent");
      node.style.setProperty("--wb-stroke", e.stroke || "#111");
      node.style.setProperty("--wb-stroke-w", `${num(e.strokeW, 0)}px`);
      node.style.setProperty("--wb-radius", `${num(e.radius, 0)}px`);
      const shape = doc.createElement("div");
      shape.className = "wb-shape";
      node.append(shape);
    }
    return node;
  }

  const placeElement = (node, e) => {
    node.style.left = `${e.x}px`;
    node.style.top = `${e.y}px`;
    node.style.width = `${e.w}px`;
    node.style.height = `${e.h}px`;
  };

  function elementNode(e) {
    const rt = runtime.get(e.frameId);
    return rt?.ready ? rt.doc.querySelector(`.wb-el[data-id="${e.id}"]`) : null;
  }

  /** Auto-height text grows with its content, like a Figma auto-height frame. */
  function syncAutoHeights(frameId) {
    let changed = false;
    for (const e of elementsOf(frameId)) {
      if (e.type !== "text" || !e.autoHeight) continue;
      const node = elementNode(e);
      const p = node?.querySelector(".wb-text");
      if (!p) continue;
      const measured = Math.max(12, Math.ceil(p.scrollHeight));
      if (Math.abs(measured - e.h) > 0.5) {
        e.h = measured;
        node.style.height = `${measured}px`;
        changed = true;
      }
    }
    return changed;
  }

  /* ==========================================================
     OVERLAY (screen space)
     ========================================================== */
  let snapLines = [];
  let dimLabel = null;
  let hoverId = null;

  function renderOverlay() {
    const layer = els.overlay;
    layer.textContent = "";
    const z = view().zoom;

    for (const f of state.frames) {
      const [sx, sy] = toScreen(f.x, f.y);
      layer.append(h("div", {
        class: `wb-flabel${selection.includes(f.id) ? " is-on" : ""}`,
        style: `left:${sx}px;top:${sy - 21}px`,
        "data-frame": f.id,
        text: `${f.name}  ${Math.round(f.w)} × ${Math.round(f.h)}`
      }));
    }

    if (hoverId && !selection.includes(hoverId)) {
      const rect = worldRect(nodeById(hoverId));
      if (rect) layer.append(box("wb-hover", rect));
    }

    for (const id of selection) {
      const node = nodeById(id);
      const rect = worldRect(node);
      if (!rect) continue;
      layer.append(box(`wb-sel${isFrame(id) ? " is-frame" : ""}`, rect));
    }

    // Handles only for a single, unlocked, non-editing selection.
    if (selection.length === 1 && editingId === null) {
      const node = nodeById(selection[0]);
      const rect = worldRect(node);
      if (rect && !node.locked) {
        const [x, y] = toScreen(rect.x, rect.y);
        const w = rect.w * z;
        const hgt = rect.h * z;
        const dirs = node.type === "line"
          ? [["w", 0, .5], ["e", 1, .5]]
          : [["nw", 0, 0], ["n", .5, 0], ["ne", 1, 0], ["e", 1, .5], ["se", 1, 1], ["s", .5, 1], ["sw", 0, 1], ["w", 0, .5]];
        for (const [dir, fx, fy] of dirs) {
          layer.append(h("div", {
            class: "wb-h",
            "data-dir": dir,
            "data-id": selection[0],
            style: `left:${x + w * fx}px;top:${y + hgt * fy}px`
          }));
        }
      }
    }

    for (const line of snapLines) {
      const [sx, sy] = toScreen(line.x1, line.y1);
      const [ex, ey] = toScreen(line.x2, line.y2);
      layer.append(h("div", {
        class: "wb-snapline",
        style: `left:${Math.min(sx, ex)}px;top:${Math.min(sy, ey)}px;width:${Math.max(1, Math.abs(ex - sx))}px;height:${Math.max(1, Math.abs(ey - sy))}px`
      }));
    }

    if (dimLabel) {
      layer.append(h("div", { class: "wb-dim", style: `left:${dimLabel.x}px;top:${dimLabel.y}px`, text: dimLabel.text }));
    }

    function box(cls, rect) {
      const [x, y] = toScreen(rect.x, rect.y);
      return h("div", { class: cls, style: `left:${x}px;top:${y}px;width:${rect.w * z}px;height:${rect.h * z}px` });
    }
  }

  function applyTransform() {
    els.world.style.transform = `translate(${view().panX}px, ${view().panY}px) scale(${view().zoom})`;
    els.zoomValue.textContent = `${Math.round(view().zoom * 100)}%`;
  }

  /* ==========================================================
     SNAPPING
     ========================================================== */
  function snapContext(frameId, excludeIds) {
    const f = frameById(frameId);
    const g = gridOf(frameId);
    const xs = [0, g.margin, f.w - g.margin, f.w, ...columnEdges(frameId)];
    const ys = [0, f.h];
    for (const e of elementsOf(frameId)) {
      if (excludeIds.includes(e.id) || e.hidden) continue;
      xs.push(e.x, e.x + e.w / 2, e.x + e.w);
      ys.push(e.y, e.y + e.h / 2, e.y + e.h);
    }
    return { xs, ys, baseline: g.baseline, frame: f };
  }

  function nearest(value, targets, threshold) {
    let best = null;
    for (const t of targets) {
      const d = Math.abs(t - value);
      if (d <= threshold && (best === null || d < best.d)) best = { t, d };
    }
    return best;
  }

  /** Returns {dx, dy, lines} for a move; edges are the candidate positions. */
  function snapMove(ctx, edgesX, edgesY, enabled, threshold) {
    const out = { dx: 0, dy: 0, lines: [] };
    if (!enabled) return out;
    let bx = null;
    for (const ex of edgesX) {
      const hit = nearest(ex, ctx.xs, threshold);
      if (hit && (bx === null || hit.d < bx.d)) bx = { d: hit.d, dx: hit.t - ex, at: hit.t };
    }
    let by = null;
    for (const ey of edgesY) {
      const hit = nearest(ey, ctx.ys, threshold);
      if (hit && (by === null || hit.d < by.d)) by = { d: hit.d, dy: hit.t - ey, at: hit.t };
    }
    if (bx) {
      out.dx = bx.dx;
      out.lines.push({ x1: ctx.frame.x + bx.at, y1: ctx.frame.y, x2: ctx.frame.x + bx.at, y2: ctx.frame.y + ctx.frame.h });
    }
    if (by) {
      out.dy = by.dy;
      out.lines.push({ x1: ctx.frame.x, y1: ctx.frame.y + by.at, x2: ctx.frame.x + ctx.frame.w, y2: ctx.frame.y + by.at });
    } else {
      // No object or column match — fall back to the 8px baseline.
      const snapped = Math.round(edgesY[0] / ctx.baseline) * ctx.baseline;
      out.dy = snapped - edgesY[0];
    }
    return out;
  }

  /* ==========================================================
     SELECTION
     ========================================================== */
  function select(ids, additive) {
    const next = additive ? [...new Set([...selection, ...ids])] : [...ids];
    if (next.length === selection.length && next.every((id, i) => id === selection[i])) return;
    selection = next;
    renderOverlay();
    renderLayers();
    renderProps();
  }

  function deleteSelection() {
    if (!selection.length) return;
    pushHistory();
    const frameIds = selection.filter(isFrame);
    state.frames = state.frames.filter(f => !frameIds.includes(f.id));
    state.elements = state.elements.filter(e => !selection.includes(e.id) && !frameIds.includes(e.frameId));
    selection = [];
    editingId = null;
    renderAll();
    save();
  }

  function duplicateSelection() {
    if (!selection.length) return;
    pushHistory();
    const made = [];
    for (const id of selection) {
      if (isFrame(id)) {
        const f = frameById(id);
        const copy = { ...clone(f), id: uid("f"), x: f.x + f.w + 80, name: `${f.name} 副本` };
        state.frames.push(copy);
        for (const e of elementsOf(id)) state.elements.push({ ...clone(e), id: uid("e"), frameId: copy.id });
        made.push(copy.id);
      } else {
        const e = elById(id);
        const copy = { ...clone(e), id: uid("e"), x: e.x + 24, y: e.y + 24 };
        state.elements.push(copy);
        made.push(copy.id);
      }
    }
    selection = made;
    renderAll();
    save();
  }

  function nudge(dx, dy) {
    const targets = selection.map(nodeById).filter(n => n && !n.locked);
    if (!targets.length) return;
    pushHistory();
    for (const node of targets) { node.x += dx; node.y += dy; }
    for (const frameId of affectedFrames()) renderElements(frameId);
    renderFrames();
    renderOverlay();
    renderProps();
    save();
  }

  const affectedFrames = () =>
    [...new Set(selection.map(id => (isFrame(id) ? id : elById(id)?.frameId)).filter(Boolean))];

  function alignSelection(mode) {
    const nodes = selection.map(nodeById).filter(n => n && !n.locked);
    if (nodes.length < 2) return;
    pushHistory();
    const rects = nodes.map(worldRect);
    const minX = Math.min(...rects.map(r => r.x));
    const maxX = Math.max(...rects.map(r => r.x + r.w));
    const minY = Math.min(...rects.map(r => r.y));
    const maxY = Math.max(...rects.map(r => r.y + r.h));
    nodes.forEach((node, i) => {
      const r = rects[i];
      if (mode === "left") node.x += minX - r.x;
      if (mode === "centerX") node.x += (minX + maxX) / 2 - (r.x + r.w / 2);
      if (mode === "right") node.x += maxX - (r.x + r.w);
      if (mode === "top") node.y += minY - r.y;
      if (mode === "centerY") node.y += (minY + maxY) / 2 - (r.y + r.h / 2);
      if (mode === "bottom") node.y += maxY - (r.y + r.h);
    });
    renderAll();
    save();
  }

  /* ==========================================================
     INTERACTION
     ========================================================== */
  let drag = null;
  let spaceDown = false;

  function setTool(tool) {
    state.view.tool = tool;
    const shapeTools = ["rect", "ellipse", "line"];
    for (const btn of document.querySelectorAll(".wb-tool")) {
      btn.classList.toggle("is-on", btn.dataset.tool === tool || (btn.dataset.tool === "rect" && shapeTools.includes(tool)));
    }
    els.viewport.dataset.tool = tool;
    for (const [id] of runtime) {
      const doc = runtime.get(id).doc;
      if (doc) doc.body.dataset.tool = DRAW_TOOLS.includes(tool) ? "draw" : tool;
    }
    if (tool !== "pointer") exitEditing();
  }

  /** Every pointerdown, wherever it started, resolves to one world point. */
  function worldFromEvent(event, frameId) {
    if (frameId) {
      const f = frameById(frameId);
      return [f.x + event.clientX, f.y + event.clientY];
    }
    return toWorld(event.clientX, event.clientY);
  }

  function screenFromEvent(event, frameId) {
    if (!frameId) return [event.clientX, event.clientY];
    const [wx, wy] = worldFromEvent(event, frameId);
    return toScreen(wx, wy);
  }

  function onPointerDown(event, frameId) {
    if (event.button === 1 || spaceDown || state.view.tool === "hand") {
      startPan(event, frameId);
      return;
    }
    if (event.button !== 0) return;

    const [wx, wy] = worldFromEvent(event, frameId);
    const tool = state.view.tool;

    if (DRAW_TOOLS.includes(tool)) {
      event.preventDefault();
      startDraw(event, frameId, wx, wy, tool);
      return;
    }

    // Pointer tool.
    const hitId = frameId ? event.target.closest?.(".wb-el")?.dataset.id : null;
    if (hitId && elById(hitId) && !elById(hitId).locked) {
      if (editingId === hitId) return; // let the caret work
      event.preventDefault();
      exitEditing();
      const additive = event.shiftKey;
      if (!selection.includes(hitId)) select([hitId], additive);
      else if (additive) select(selection.filter(id => id !== hitId), false);
      startMove(event, frameId, wx, wy);
      return;
    }

    exitEditing();
    const frameHit = frameId ? frameById(frameId) : frameAt(wx, wy);
    if (frameHit) {
      event.preventDefault();
      select([frameHit.id], event.shiftKey);
      startMove(event, frameId, wx, wy);
      return;
    }
    if (!event.shiftKey) select([], false);
    startMarquee(event, frameId, wx, wy);
  }

  function startPan(event, frameId) {
    event.preventDefault();
    const [sx, sy] = screenFromEvent(event, frameId);
    els.viewport.classList.add("is-panning");
    drag = {
      kind: "pan",
      sx, sy,
      panX: view().panX,
      panY: view().panY,
      frameId
    };
    capture(event, frameId);
  }

  function startMarquee(event, frameId, wx, wy) {
    drag = { kind: "marquee", wx, wy, frameId, additive: event.shiftKey, base: [...selection] };
    capture(event, frameId);
  }

  function startMove(event, frameId, wx, wy) {
    const nodes = selection.map(nodeById).filter(n => n && !n.locked);
    if (!nodes.length) return;
    pushHistory();
    drag = {
      kind: "move",
      wx, wy, frameId,
      moved: false,
      nodes: nodes.map(n => ({ node: n, x: n.x, y: n.y }))
    };
    capture(event, frameId);
  }

  function startDraw(event, frameId, wx, wy, tool) {
    const host = frameId ? frameById(frameId) : frameAt(wx, wy);
    if (tool !== "frame" && !host) {
      toast("请先用画框工具创建一个画框");
      setTool("pointer");
      return;
    }
    drag = { kind: "draw", tool, wx, wy, frameId, host, moved: false };
    drag.ghost = h("div", { class: "wb-marquee" });
    els.viewport.append(drag.ghost);
    capture(event, frameId);
  }

  function startResize(event, dir, id) {
    const node = nodeById(id);
    if (!node || node.locked) return;
    event.preventDefault();
    pushHistory();
    const rect = worldRect(node);
    drag = {
      kind: "resize",
      dir,
      node,
      start: { ...rect },
      origin: { x: node.x, y: node.y, w: node.w, h: node.h },
      sx: event.clientX,
      sy: event.clientY,
      frameId: null
    };
    // Capture is an optimisation; never let it stop the listeners being wired.
    try { event.target.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function capture(event, frameId) {
    const target = frameId ? runtime.get(frameId).doc : document;
    const win = frameId ? runtime.get(frameId).doc.defaultView : window;
    drag.win = win;
    drag.target = target;
    win.addEventListener("pointermove", onPointerMove);
    win.addEventListener("pointerup", onPointerUp, { once: true });
    if (win !== window) {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
    }
  }

  function releaseCapture() {
    window.removeEventListener("pointermove", onPointerMove);
    if (drag?.win && drag.win !== window) drag.win.removeEventListener("pointermove", onPointerMove);
  }

  function onPointerMove(event) {
    if (!drag) return;
    const inFrame = event.view !== window ? drag.frameId : null;
    const [wx, wy] = inFrame ? worldFromEvent(event, inFrame) : toWorld(event.clientX, event.clientY);

    if (drag.kind === "pan") {
      const [sx, sy] = inFrame ? screenFromEvent(event, inFrame) : [event.clientX, event.clientY];
      view().panX = drag.panX + (sx - drag.sx);
      view().panY = drag.panY + (sy - drag.sy);
      applyTransform();
      renderOverlay();
      return;
    }

    if (drag.kind === "marquee") {
      const [ax, ay] = toScreen(Math.min(drag.wx, wx), Math.min(drag.wy, wy));
      const w = Math.abs(wx - drag.wx) * view().zoom;
      const hgt = Math.abs(wy - drag.wy) * view().zoom;
      els.marquee.hidden = false;
      els.marquee.style.cssText = `left:${ax}px;top:${ay}px;width:${w}px;height:${hgt}px`;
      const box = { x: Math.min(drag.wx, wx), y: Math.min(drag.wy, wy), w: Math.abs(wx - drag.wx), h: Math.abs(wy - drag.wy) };
      const hits = state.elements.filter(e => {
        const r = worldRect(e);
        return r && r.x < box.x + box.w && r.x + r.w > box.x && r.y < box.y + box.h && r.y + r.h > box.y;
      }).map(e => e.id);
      select(drag.additive ? [...drag.base, ...hits] : hits, false);
      return;
    }

    if (drag.kind === "draw") {
      drag.moved = true;
      const [ax, ay] = toScreen(Math.min(drag.wx, wx), Math.min(drag.wy, wy));
      drag.ghost.style.cssText =
        `left:${ax}px;top:${ay}px;width:${Math.abs(wx - drag.wx) * view().zoom}px;height:${Math.abs(wy - drag.wy) * view().zoom}px`;
      drag.rect = { x: Math.min(drag.wx, wx), y: Math.min(drag.wy, wy), w: Math.abs(wx - drag.wx), h: Math.abs(wy - drag.wy) };
      return;
    }

    if (drag.kind === "move") {
      drag.moved = true;
      let dx = wx - drag.wx;
      let dy = wy - drag.wy;
      if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }

      snapLines = [];
      const primary = drag.nodes[0];
      const snapOn = state.view.snap && !event.altKey;
      if (primary.node.frameId !== undefined) {
        const ctx = snapContext(primary.node.frameId, drag.nodes.map(n => n.node.id));
        const px = primary.x + dx;
        const py = primary.y + dy;
        const fix = snapMove(ctx, [px, px + primary.node.w / 2, px + primary.node.w], [py, py + primary.node.h / 2, py + primary.node.h], snapOn, 6 / view().zoom);
        dx += fix.dx;
        dy += fix.dy;
        snapLines = fix.lines;
      } else if (snapOn) {
        dx = Math.round((primary.x + dx) / 8) * 8 - primary.x;
        dy = Math.round((primary.y + dy) / 8) * 8 - primary.y;
      }

      for (const item of drag.nodes) {
        item.node.x = round(item.x + dx);
        item.node.y = round(item.y + dy);
        const node = item.node.frameId !== undefined ? elementNode(item.node) : runtime.get(item.node.id)?.wrap;
        if (!node) continue;
        if (item.node.frameId !== undefined) placeElement(node, item.node);
        else { node.style.left = `${item.node.x}px`; node.style.top = `${item.node.y}px`; }
      }
      showDim(primary.node, `${Math.round(primary.node.x)}, ${Math.round(primary.node.y)}`);
      renderOverlay();
      return;
    }

    if (drag.kind === "resize") {
      const dxScreen = (event.clientX - drag.sx) / view().zoom;
      const dyScreen = (event.clientY - drag.sy) / view().zoom;
      const o = drag.origin;
      const node = drag.node;
      const dir = drag.dir;
      let x = o.x, y = o.y, w = o.w, hgt = o.h;

      if (dir.includes("e")) w = o.w + dxScreen;
      if (dir.includes("w")) { x = o.x + dxScreen; w = o.w - dxScreen; }
      if (dir.includes("s")) hgt = o.h + dyScreen;
      if (dir.includes("n")) { y = o.y + dyScreen; hgt = o.h - dyScreen; }

      const snapOn = state.view.snap && !event.altKey;
      snapLines = [];
      if (node.frameId !== undefined && snapOn) {
        const ctx = snapContext(node.frameId, [node.id]);
        const t = 6 / view().zoom;
        if (dir.includes("e")) { const hit = nearest(x + w, ctx.xs, t); if (hit) { w = hit.t - x; pushLineX(ctx, hit.t); } }
        if (dir.includes("w")) { const hit = nearest(x, ctx.xs, t); if (hit) { w += x - hit.t; x = hit.t; pushLineX(ctx, hit.t); } }
        if (dir.includes("s")) { const hit = nearest(y + hgt, ctx.ys, t); if (hit) { hgt = hit.t - y; pushLineY(ctx, hit.t); } else hgt = Math.round(hgt / ctx.baseline) * ctx.baseline; }
        if (dir.includes("n")) { const hit = nearest(y, ctx.ys, t); if (hit) { hgt += y - hit.t; y = hit.t; pushLineY(ctx, hit.t); } }
      }

      if (event.shiftKey && node.type !== "line" && o.w && o.h) {
        const ratio = o.w / o.h;
        if (dir.length === 2) hgt = w / ratio;
      }
      if (node.type === "image" && node.ratio && RATIOS[node.ratio] && dir.length === 2) hgt = w / RATIOS[node.ratio];

      node.x = round(x);
      node.y = round(y);
      node.w = round(Math.max(node.type === "line" ? 2 : 8, w));
      node.h = round(Math.max(node.type === "line" ? 1 : 8, hgt));
      if (node.type === "text") node.autoHeight = false;

      if (node.frameId !== undefined) {
        const el = elementNode(node);
        if (el) placeElement(el, node);
      } else {
        const rt = runtime.get(node.id);
        if (rt) {
          rt.wrap.style.left = `${node.x}px`;
          rt.wrap.style.top = `${node.y}px`;
          rt.wrap.style.width = `${node.w}px`;
          rt.wrap.style.height = `${node.h}px`;
          applyFrameVars(node.id);
        }
      }
      showDim(node, `${Math.round(node.w)} × ${Math.round(node.h)}`);
      renderOverlay();
      renderProps();
    }

    function pushLineX(ctx, at) {
      snapLines.push({ x1: ctx.frame.x + at, y1: ctx.frame.y, x2: ctx.frame.x + at, y2: ctx.frame.y + ctx.frame.h });
    }
    function pushLineY(ctx, at) {
      snapLines.push({ x1: ctx.frame.x, y1: ctx.frame.y + at, x2: ctx.frame.x + ctx.frame.w, y2: ctx.frame.y + at });
    }
  }

  function showDim(node, text) {
    const rect = worldRect(node);
    if (!rect) return;
    const [x, y] = toScreen(rect.x + rect.w / 2, rect.y + rect.h);
    dimLabel = { x, y: y + 8, text };
  }

  function onPointerUp() {
    if (!drag) return;
    releaseCapture();
    els.viewport.classList.remove("is-panning");
    els.marquee.hidden = true;
    snapLines = [];
    dimLabel = null;

    if (drag.kind === "draw") {
      drag.ghost.remove();
      commitDraw();
    } else if (drag.kind === "move" && drag.moved) {
      reparentMoved();
      save();
    } else if (drag.kind === "resize") {
      if (drag.node.frameId !== undefined) syncAutoHeights(drag.node.frameId);
      else renderElements(drag.node.id);
      save();
    } else if (drag.kind === "pan") {
      save();
    }

    drag = null;
    renderOverlay();
    renderLayers();
    renderProps();
  }

  /** An element dragged onto another frame changes owner, Figma-style. */
  function reparentMoved() {
    let moved = false;
    for (const { node } of drag.nodes) {
      if (node.frameId === undefined) continue;
      const rect = worldRect(node);
      const host = frameAt(rect.x + rect.w / 2, rect.y + rect.h / 2);
      if (host && host.id !== node.frameId) {
        const from = node.frameId;
        node.x = round(rect.x - host.x);
        node.y = round(rect.y - host.y);
        node.frameId = host.id;
        renderElements(from);
        moved = true;
      }
    }
    for (const frameId of new Set(state.elements.map(e => e.frameId))) {
      if (moved) renderElements(frameId);
    }
    if (!moved) for (const frameId of affectedFrames()) syncAutoHeights(frameId);
  }

  function commitDraw() {
    const tool = drag.tool;
    const rect = drag.rect && drag.moved && drag.rect.w > 4 && drag.rect.h > 4 ? drag.rect : null;

    if (tool === "frame") {
      pushHistory();
      const preset = FRAME_PRESETS[0];
      const frame = {
        id: uid("f"),
        name: `画框 ${state.frames.length + 1}`,
        x: round(rect ? rect.x : drag.wx),
        y: round(rect ? rect.y : drag.wy),
        w: Math.max(240, Math.round(rect ? rect.w : preset.w)),
        h: Math.max(240, Math.round(rect ? rect.h : preset.h)),
        header: clone(HEADER_SPEC),
        footer: clone(FOOTER_SPEC)
      };
      state.frames.push(frame);
      selection = [frame.id];
      setTool("pointer");
      renderAll();
      save();
      return;
    }

    const host = drag.host;
    if (!host) { setTool("pointer"); return; }
    pushHistory();
    const type = tool === "rect" ? state.view.shape : tool;
    const e = blankElement(type === "rect" || type === "ellipse" || type === "line" ? type : tool, host.id);
    if (rect) {
      e.x = round(rect.x - host.x);
      e.y = round(rect.y - host.y);
      e.w = round(Math.max(8, rect.w));
      e.h = round(Math.max(type === "line" ? 1 : 8, rect.h));
      if (e.type === "text") e.autoHeight = false;
    } else {
      e.x = round(drag.wx - host.x);
      e.y = round(drag.wy - host.y);
    }
    if (e.type === "line") e.h = e.strokeW;
    state.elements.push(e);
    selection = [e.id];
    setTool("pointer");
    renderElements(host.id);
    renderOverlay();
    renderLayers();
    renderProps();
    save();
    if (e.type === "text") setTimeout(() => enterEditing(e.id), 30);
  }

  /* ==========================================================
     TEXT EDITING
     ========================================================== */
  function enterEditing(id) {
    const e = elById(id);
    if (!e || e.type !== "text" || e.locked) return;
    const node = elementNode(e);
    const p = node?.querySelector(".wb-text");
    if (!p) return;
    editingId = id;
    node.dataset.editing = "true";
    p.contentEditable = "true";
    p.focus();
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(p);
    range.collapse(false);
    const sel = node.ownerDocument.defaultView.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    pushHistory();
    renderOverlay();
  }

  function exitEditing() {
    if (editingId === null) return;
    const e = elById(editingId);
    const node = e && elementNode(e);
    if (node) {
      node.dataset.editing = "false";
      const p = node.querySelector(".wb-text");
      if (p) {
        p.contentEditable = "false";
        e.text = p.textContent;
        node.dataset.empty = String(!e.text);
      }
    }
    editingId = null;
    if (e) syncAutoHeights(e.frameId);
    renderOverlay();
    renderLayers();
    renderProps();
    save();
  }

  /* ==========================================================
     VIEW CONTROL
     ========================================================== */
  function zoomAt(sx, sy, factor) {
    const z = clamp(view().zoom * factor, 0.02, 8);
    const k = z / view().zoom;
    view().panX = sx - (sx - view().panX) * k;
    view().panY = sy - (sy - view().panY) * k;
    view().zoom = z;
    applyTransform();
    renderOverlay();
    save();
  }

  function zoomTo(z, sx, sy) {
    zoomAt(sx ?? window.innerWidth / 2, sy ?? window.innerHeight / 2, z / view().zoom);
  }

  function zoomFit() {
    const targets = selection.length ? selection.map(id => worldRect(nodeById(id))).filter(Boolean) : state.frames;
    if (!targets.length) return;
    const minX = Math.min(...targets.map(r => r.x));
    const minY = Math.min(...targets.map(r => r.y));
    const maxX = Math.max(...targets.map(r => r.x + r.w));
    const maxY = Math.max(...targets.map(r => r.y + r.h));
    // Fit inside the canvas that is actually visible between the two panels.
    const leftInset = els.layersPanel.classList.contains("is-closed") ? 60 : els.layersPanel.offsetWidth + 24;
    const rightInset = els.propsPanel.classList.contains("is-closed") ? 60 : els.propsPanel.offsetWidth + 24;
    const availW = Math.max(200, window.innerWidth - leftInset - rightInset - 48);
    const availH = Math.max(200, window.innerHeight - 190);
    const z = clamp(Math.min(availW / (maxX - minX), availH / (maxY - minY)), 0.02, 2);
    view().zoom = z;
    view().panX = leftInset + 24 + availW / 2 - ((minX + maxX) / 2) * z;
    view().panY = 62 + availH / 2 - ((minY + maxY) / 2) * z;
    applyTransform();
    renderOverlay();
    save();
  }

  function onWheel(event, frameId) {
    event.preventDefault();
    const [sx, sy] = screenFromEvent(event, frameId);
    if (event.ctrlKey || event.metaKey) {
      zoomAt(sx, sy, Math.exp(-event.deltaY * 0.01));
      return;
    }
    view().panX -= event.deltaX;
    view().panY -= event.deltaY;
    applyTransform();
    renderOverlay();
  }

  /* ==========================================================
     FRAME DOCUMENT BINDING
     ========================================================== */
  function bindFrameDoc(frameId, doc) {
    doc.addEventListener("pointerdown", event => onPointerDown(event, frameId));
    doc.addEventListener("pointermove", event => {
      if (drag) return;
      const id = event.target.closest?.(".wb-el")?.dataset.id;
      const next = id || frameId;
      if (next !== hoverId) { hoverId = next; renderOverlay(); }
    });
    doc.addEventListener("pointerleave", () => { if (!drag && hoverId) { hoverId = null; renderOverlay(); } });
    doc.addEventListener("dblclick", event => {
      const id = event.target.closest?.(".wb-el")?.dataset.id;
      if (id && elById(id)?.type === "text") { event.preventDefault(); enterEditing(id); }
    });
    doc.addEventListener("input", event => {
      if (!editingId || !event.target.closest(".wb-text")) return;
      const e = elById(editingId);
      if (!e) return;
      e.text = event.target.textContent;
      const node = elementNode(e);
      if (node) node.dataset.empty = String(!e.text);
      syncAutoHeights(e.frameId);
      renderOverlay();
      save();
    });
    doc.addEventListener("wheel", event => onWheel(event, frameId), { passive: false });
    doc.addEventListener("keydown", onKeydown);
    doc.addEventListener("keyup", onKeyup);
    doc.addEventListener("contextmenu", event => event.preventDefault());
  }

  /* ==========================================================
     LAYERS
     ========================================================== */
  function renderLayers() {
    const body = els.layerTree;
    body.textContent = "";
    if (!state.frames.length) {
      body.append(h("div", { class: "wb-empty", html: '按 <kbd>F</kbd> 用画框工具拖出一个页面画框，再用 <kbd>R</kbd> <kbd>T</kbd> <kbd>I</kbd> 往里放东西。' }));
      return;
    }
    const tree = h("div", { class: "wb-tree" });
    for (const f of [...state.frames].reverse()) {
      tree.append(row(f, true));
      for (const e of [...elementsOf(f.id)].reverse()) tree.append(row(e, false));
    }
    body.append(tree);

    function row(node, frame) {
      const id = node.id;
      return h("div", {
        class: `wb-row${frame ? " is-frame" : " wb-row-child"}${selection.includes(id) ? " is-on" : ""}`,
        onclick: event => { exitEditing(); select([id], event.shiftKey); },
        ondblclick: () => { if (!frame && node.type === "text") enterEditing(id); else zoomFit(); }
      },
        h("span", { class: "wb-row-ico", html: frame ? ICON.frame : ICON[node.type] || ICON.rect }),
        h("span", { class: "wb-row-name", text: frame ? node.name : elementName(node) }),
        h("button", {
          class: `wb-row-btn${node.hidden ? " is-on" : ""}`,
          title: node.hidden ? "显示" : "隐藏",
          html: node.hidden ? ICON.eyeOff : ICON.eye,
          onclick: event => {
            event.stopPropagation();
            pushHistory();
            node.hidden = !node.hidden;
            if (frame) runtime.get(id).wrap.style.display = node.hidden ? "none" : "";
            else renderElements(node.frameId);
            renderLayers();
            save();
          }
        })
      );
    }
  }

  /* ==========================================================
     PROPERTIES
     ========================================================== */
  function renderProps() {
    const body = els.propsBody;
    body.textContent = "";
    if (selection.length > 1) {
      els.propsTitle.textContent = `${selection.length} 个对象`;
      body.append(multiSection());
    } else if (selection.length === 1 && isFrame(selection[0])) {
      els.propsTitle.textContent = "画框";
      body.append(...frameSections(frameById(selection[0])));
    } else if (selection.length === 1) {
      const e = elById(selection[0]);
      els.propsTitle.textContent = EL_CN[e.type];
      body.append(...elementSections(e));
    } else {
      els.propsTitle.textContent = "页面";
      body.append(...pageSections());
    }
    resyncSample(body);
  }

  /** The panel was rebuilt: keep the sample only if its level is still here. */
  function resyncSample(body) {
    if (els.typeSample.hidden) return;
    let anchor = sampleKey && body.querySelector(`[data-level-fields="${sampleKey}"]`);
    if (!anchor) {
      // A text element's own level block is the only one on screen — follow it.
      const blocks = body.querySelectorAll("[data-level-fields]");
      if (blocks.length === 1) {
        anchor = blocks[0];
        sampleKey = anchor.dataset.levelFields;
      } else {
        hideSample();
        return;
      }
    }
    updateSample();
  }

  /* --- shared field builders --- */
  function field(label, value, onChange, opts = {}) {
    const input = h("input", {
      type: opts.type || "number",
      value,
      step: opts.step || 1,
      min: opts.min,
      max: opts.max,
      oninput: event => onChange(opts.type === "text" ? event.target.value : num(event.target.value, value)),
      onfocus: pushHistory
    });
    return h("label", { class: "wb-f" }, h("label", { text: label }), input);
  }

  function selectField(label, value, options, onChange) {
    const node = h("select", { onchange: event => { pushHistory(); onChange(event.target.value); } },
      ...options.map(([v, t]) => h("option", { value: v, selected: v === value }, t)));
    return h("label", { class: "wb-f" }, label ? h("label", { text: label }) : null, node);
  }

  function check(label, value, onChange) {
    return h("label", { class: "wb-check" },
      h("input", { type: "checkbox", checked: value, onchange: event => { pushHistory(); onChange(event.target.checked); } }),
      h("span", { text: label }));
  }

  const section = (title, extra, ...kids) =>
    h("div", { class: "wb-sec" }, h("div", { class: "wb-sec-t" }, h("span", { text: title }), extra || null), ...kids);

  function commit(scope) {
    return () => {
      if (scope === "frames") renderFrames();
      for (const frameId of runtime.keys()) applyFrameVars(frameId);
      if (scope === "elements") for (const frameId of runtime.keys()) renderElements(frameId);
      renderOverlay();
      renderLayers();
      save();
    };
  }

  /* --- page (nothing selected) --- */
  function pageSections() {
    const g = state.grid;
    const apply = () => {
      for (const frameId of runtime.keys()) { applyFrameVars(frameId); }
      renderOverlay();
      save();
    };
    const gridFields = h("div", { class: "wb-g2" },
      field("列", g.cols, v => { g.cols = clamp(Math.round(v), 2, 24); apply(); }),
      field("边距", g.margin, v => { g.margin = clamp(v, 0, 400); apply(); }),
      field("间距", g.gutter, v => { g.gutter = clamp(v, 0, 200); apply(); }),
      field("基线", g.baseline, v => { g.baseline = clamp(v, 2, 64); apply(); })
    );
    for (const input of gridFields.querySelectorAll("input")) input.disabled = g.followSpec;

    return [
      section("网格", null,
        check("跟随规范（随画框宽度自动 12 / 6 / 4 / 2 栏）", g.followSpec, v => {
          g.followSpec = v;
          renderProps();
          apply();
        }),
        gridFields,
        h("button", {
          class: "wb-btn is-wide", text: "恢复规范值 12 · 48 · 32 · 8",
          style: "margin-top:7px",
          onclick: () => { pushHistory(); Object.assign(state.grid, { followSpec: true, ...SPEC_GRID }); renderProps(); apply(); toast("网格已恢复规范值"); }
        })
      ),
      typeSection(),
      section("白板", null,
        h("button", { class: "wb-btn is-wide", text: "新建画框", onclick: () => { addFramePreset(FRAME_PRESETS[0]); } }),
        h("div", { class: "wb-note", text: `${state.frames.length} 个画框 · ${state.elements.length} 个元素` })
      )
    ];
  }

  function typeSection() {
    const ratioTool = h("div", null,
      h("div", { class: "wb-g2" },
        field("基准", typeTool.base, v => { typeTool.base = clamp(v, 10, 40); }),
        selectField("级差", String(typeTool.ratio), [["1.125", "1.125"], ["1.2", "1.2"], ["1.25", "1.25"], ["1.333", "1.333"], ["1.414", "1.414"], ["1.5", "1.5"]], v => { typeTool.ratio = Number(v); }),
        field("参考宽", typeTool.ref, v => { typeTool.ref = clamp(v, 600, 2600); }),
        field("最小系数", typeTool.shrink, v => { typeTool.shrink = clamp(v, 0.3, 1); }, { step: 0.01 })
      ),
      h("div", { class: "wb-g2", style: "margin-top:6px" },
        h("button", { class: "wb-btn", text: "按比例生成", onclick: generateScale }),
        h("button", { class: "wb-btn", text: "恢复规范", onclick: resetType })
      )
    );

    const list = h("div", { style: "margin-top:8px" });
    for (const meta of LEVELS) {
      const l = state.type[meta.key];
      const node = h("details", { class: "wb-lvl", "data-level": meta.key, open: openLevel === meta.key },
        h("summary", null,
          h("span", { class: "wb-lvl-n", text: meta.cn }),
          h("span", { class: "wb-lvl-v", text: `--type-${meta.key}` }),
          h("span", { class: "wb-lvl-s", text: l.min === l.max ? `${l.max}` : `${l.min}–${l.max}` })
        ),
        h("div", { class: "wb-lvl-b" }, levelFields(meta.key))
      );
      node.addEventListener("toggle", () => {
        if (node.open) {
          openLevel = meta.key;
          for (const other of list.querySelectorAll("details[open]")) if (other !== node) other.open = false;
          showSample(meta.key, node);
        } else if (openLevel === meta.key) {
          openLevel = null;
          hideSample();
        }
      });
      list.append(node);
    }
    return section("字体级别", null, ratioTool, list);
  }

  function levelFields(key) {
    const l = state.type[key];
    const apply = () => {
      for (const frameId of runtime.keys()) { applyFrameVars(frameId); syncAutoHeights(frameId); }
      renderOverlay();
      updateSample();
      save();
    };
    const wrap = h("div", { "data-level-fields": key },
      h("div", { class: "wb-g2" },
        field("MIN", l.min, v => { l.min = clamp(v, 6, 300); if (l.min > l.max) l.max = l.min; apply(); }),
        field("MAX", l.max, v => { l.max = clamp(v, 6, 300); if (l.max < l.min) l.min = l.max; apply(); }),
        field("PX", l.base, v => { l.base = clamp(v, 0, 300); apply(); }),
        field("VW", l.vw, v => { l.vw = clamp(v, 0, 30); apply(); }, { step: 0.1 })
      ),
      h("div", { class: "wb-g3", style: "margin-top:6px" },
        field("W", l.weight, v => { l.weight = clamp(Math.round(v / 50) * 50, 100, 900); apply(); }, { step: 50 }),
        field("LH", l.lh, v => { l.lh = clamp(v, 0.7, 3); apply(); }, { step: 0.01 }),
        field("LS", l.ls, v => { l.ls = clamp(v, -0.2, 0.5); apply(); }, { step: 0.005 })
      )
    );
    // Touching any field is "editing this level", wherever the block is shown.
    wrap.addEventListener("focusin", () => showSample(key, wrap));
    wrap.addEventListener("input", () => showSample(key, wrap));
    return wrap;
  }

  /* ----------------------------------------------------------
     TYPE SAMPLE — the level rendered at the size it actually
     resolves to inside a frame, because the scale uses vw.
     ---------------------------------------------------------- */
  let openLevel = null;
  let sampleKey = null;

  /** The level's real px inside that frame.
      Measured off the frame's own probe, because vw does not resolve to
      width/100 there — the spec's scrollbar-gutter narrows it. Falls back to
      computing the clamp when no frame is loaded. */
  function resolvedSize(key, frame) {
    const rt = frame && runtime.get(frame.id);
    const probe = rt?.ready ? rt.doc.getElementById("wbProbe") : null;
    if (probe) {
      probe.style.fontSize = `var(--type-${key})`;
      const px = parseFloat(getComputedStyle(probe).fontSize);
      if (Number.isFinite(px) && px > 0) return px;
    }
    const level = state.type[key];
    if (level.min === level.max) return level.max;
    return clamp(level.base + (level.vw * (frame ? frame.w : window.innerWidth)) / 100, level.min, level.max);
  }

  /** The frame the sample speaks for: the selected one, else the first. */
  function sampleFrame() {
    const id = selection[0];
    if (id) {
      const f = isFrame(id) ? frameById(id) : frameById(elById(id)?.frameId);
      if (f) return f;
    }
    return state.frames[0] || null;
  }

  function fontStacks() {
    const doc = [...runtime.values()].find(rt => rt.ready)?.doc;
    if (!doc) return { font: null, mono: null };
    const cs = getComputedStyle(doc.documentElement);
    return { font: cs.getPropertyValue("--font").trim(), mono: cs.getPropertyValue("--mono").trim() };
  }

  function showSample(key, anchor) {
    sampleKey = key;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const top = clamp(rect.top - 8, 62, Math.max(62, window.innerHeight - 300));
      els.typeSample.style.top = `${top}px`;
    }
    els.typeSample.hidden = false;
    updateSample();
  }

  function hideSample() {
    sampleKey = null;
    els.typeSample.hidden = true;
  }

  function updateSample() {
    if (!sampleKey || els.typeSample.hidden) return;
    const meta = LEVELS.find(l => l.key === sampleKey);
    const level = state.type[sampleKey];
    if (!meta || !level) { hideSample(); return; }

    const frame = sampleFrame();
    const width = frame ? frame.w : window.innerWidth;
    const size = resolvedSize(sampleKey, frame);
    const stacks = fontStacks();
    const mono = sampleKey === "label";
    const soft = sampleKey === "meta" || sampleKey === "label";

    const node = els.sampleText;
    // Render at full precision; only the readout is rounded.
    node.style.setProperty("--sample-size", `${size}px`);
    node.style.setProperty("--sample-weight", String(level.weight));
    node.style.setProperty("--sample-lh", String(level.lh));
    node.style.setProperty("--sample-ls", `${level.ls}em`);
    node.style.setProperty("--sample-transform", mono ? "uppercase" : "none");
    node.style.setProperty("--sample-color", soft ? "var(--ui-soft)" : "var(--ui-ink)");
    const stack = mono ? stacks.mono : stacks.font;
    if (stack) node.style.setProperty("--sample-family", stack);
    if (node.textContent !== state.view.sampleText) node.textContent = state.view.sampleText;

    els.sampleName.textContent = meta.cn;
    els.sampleVar.textContent = `--type-${sampleKey}`;
    els.sampleSize.textContent = `${size.toFixed(1)}px`;
    els.sampleCtx.textContent = level.min === level.max
      ? `固定 · ${frame ? `${Math.round(width)} 画框` : "无画框"}`
      : `${frame ? `${Math.round(width)} 画框` : "窗口"} · clamp ${level.min}–${level.max}`;
  }

  const typeTool = { base: 16, ratio: 1.25, ref: 1600, shrink: 0.72 };

  function generateScale() {
    pushHistory();
    const bodyIndex = LEVEL_KEYS.indexOf("body");
    LEVEL_KEYS.forEach((key, index) => {
      const l = state.type[key];
      const max = Math.round(typeTool.base * Math.pow(typeTool.ratio, bodyIndex - index));
      l.max = max;
      l.min = Math.min(Math.max(10, Math.round(max * typeTool.shrink)), max);
      l.base = 0;
      l.vw = l.min === l.max ? 0 : Math.round((max / typeTool.ref) * 1000) / 10;
    });
    for (const frameId of runtime.keys()) { applyFrameVars(frameId); syncAutoHeights(frameId); }
    renderProps();
    renderOverlay();
    save();
    toast(`已按 ${typeTool.ratio} 级差生成 9 级字体`);
  }

  function resetType() {
    pushHistory();
    state.type = defaultType();
    for (const frameId of runtime.keys()) { applyFrameVars(frameId); syncAutoHeights(frameId); }
    renderProps();
    renderOverlay();
    save();
    toast("字体级别已恢复规范值");
  }

  /* --- frame --- */
  function frameSections(f) {
    const apply = commit("frames");
    const presetValue = FRAME_PRESETS.findIndex(p => p.w === f.w);
    return [
      section("画框", null,
        h("label", { class: "wb-f" }, h("label", { text: "名称" }),
          h("input", { type: "text", value: f.name, onfocus: pushHistory, oninput: e => { f.name = e.target.value; renderOverlay(); renderLayers(); save(); } })),
        h("div", { style: "margin-top:6px" },
          selectField("尺寸", String(presetValue), FRAME_PRESETS.map((p, i) => [String(i), p.name]).concat([["-1", "自定义"]]), v => {
            const p = FRAME_PRESETS[Number(v)];
            if (!p) return;
            f.w = p.w;
            f.h = p.h;
            renderProps();
            apply();
          })),
        h("div", { class: "wb-g2", style: "margin-top:6px" },
          field("X", Math.round(f.x), v => { f.x = v; apply(); renderOverlay(); }),
          field("Y", Math.round(f.y), v => { f.y = v; apply(); renderOverlay(); }),
          field("W", Math.round(f.w), v => { f.w = clamp(v, 200, 4000); apply(); renderOverlay(); }),
          field("H", Math.round(f.h), v => { f.h = clamp(v, 200, 12000); apply(); renderOverlay(); })
        )
      ),
      headerSection(f, apply),
      footerSection(f, apply),
      section("操作", null,
        h("div", { class: "wb-g2" },
          h("button", { class: "wb-btn", text: "复制", onclick: duplicateSelection }),
          h("button", { class: "wb-btn is-danger", text: "删除", onclick: deleteSelection })
        )
      )
    ];
  }

  function headerSection(f, apply) {
    const hd = f.header;
    return section("页眉 HEADING", null,
      check("显示页眉", hd.on, v => { hd.on = v; apply(); }),
      check("底部分隔线", hd.rule, v => { hd.rule = v; apply(); }),
      check("显示 YUNTAO LU", hd.brand, v => { hd.brand = v; apply(); }),
      check("显示语言 / 主题按钮", hd.tools, v => { hd.tools = v; apply(); }),
      h("div", { class: "wb-g2", style: "margin-top:6px" },
        field("距顶", Math.round(hd.top), v => { hd.top = clamp(v, 0, 2000); apply(); }),
        field("留白", Math.round(hd.pad), v => { hd.pad = clamp(v, 0, 120); hd.custom = true; renderProps(); apply(); })
      ),
      h("div", { style: "margin-top:6px" },
        selectField("导航", hd.navJustify, [["flex-start", "左对齐"], ["center", "居中"], ["flex-end", "右对齐"]], v => {
          hd.navJustify = v;
          hd.custom = true;
          renderProps();
          apply();
        })),
      check("覆盖页眉位置参数", hd.custom, v => { hd.custom = v; apply(); }),
      !hd.custom ? h("div", { class: "wb-note", text: "未覆盖时沿用规范自身的响应式表现。" }) : null
    );
  }

  function footerSection(f, apply) {
    const ft = f.footer;
    return section("页尾 FOOTER", null,
      check("显示页尾", ft.on, v => { ft.on = v; apply(); }),
      check("顶部分隔线", ft.rule, v => { ft.rule = v; apply(); }),
      check("显示 GRID / EDIT", ft.tools, v => { ft.tools = v; apply(); }),
      h("label", { class: "wb-f wb-stack", style: "margin-top:6px" }, h("label", { text: "左侧文字" }),
        h("input", { type: "text", value: ft.leftText, onfocus: pushHistory, oninput: e => { ft.leftText = e.target.value; apply(); } })),
      h("label", { class: "wb-f wb-stack", style: "margin-top:6px" }, h("label", { text: "右侧文字" }),
        h("input", { type: "text", value: ft.rightText, onfocus: pushHistory, oninput: e => { ft.rightText = e.target.value; apply(); } })),
      h("div", { style: "margin-top:6px" },
        selectField("预设", ft.preset, [["spec", "规范 1/5 · 5/9"], ["ends", "两端对齐"], ["stack", "上下堆叠"], ["center", "居中并排"]], v => {
          Object.assign(ft, FOOTER_PRESETS[v], { preset: v, custom: true });
          renderProps();
          apply();
        })),
      h("div", { class: "wb-g2", style: "margin-top:6px" },
        field("左起", ft.lStart, v => { ft.lStart = clamp(Math.round(v), 1, 24); ft.custom = true; renderProps(); apply(); }),
        field("左跨", ft.lSpan, v => { ft.lSpan = clamp(Math.round(v), 1, 24); ft.custom = true; renderProps(); apply(); }),
        field("右起", ft.rStart, v => { ft.rStart = clamp(Math.round(v), 1, 24); ft.custom = true; renderProps(); apply(); }),
        field("右跨", ft.rSpan, v => { ft.rSpan = clamp(Math.round(v), 1, 24); ft.custom = true; renderProps(); apply(); }),
        field("距底", Math.round(ft.bottom), v => { ft.bottom = clamp(v, 0, 2000); apply(); }),
        field("留白", Math.round(ft.pad), v => { ft.pad = clamp(v, 0, 200); ft.custom = true; renderProps(); apply(); })
      ),
      check("覆盖页尾位置参数", ft.custom, v => { ft.custom = v; apply(); })
    );
  }

  /* --- element --- */
  function elementSections(e) {
    const apply = () => {
      const node = elementNode(e);
      if (node) {
        const fresh = buildElement(node.ownerDocument, e);
        node.replaceWith(fresh);
      }
      syncAutoHeights(e.frameId);
      renderOverlay();
      renderLayers();
      save();
    };
    const geometry = section("位置与尺寸", null,
      h("div", { class: "wb-g2" },
        field("X", Math.round(e.x), v => { e.x = v; apply(); }),
        field("Y", Math.round(e.y), v => { e.y = v; apply(); }),
        field("W", Math.round(e.w), v => { e.w = Math.max(2, v); apply(); }),
        field("H", Math.round(e.h), v => { e.h = Math.max(1, v); e.autoHeight = false; renderProps(); apply(); })
      ),
      h("div", { class: "wb-g2", style: "margin-top:6px" },
        h("button", { class: "wb-btn", text: "贴左栏", onclick: () => snapToColumn(e, "left") }),
        h("button", { class: "wb-btn", text: "整栏宽", onclick: () => snapToColumn(e, "full") })
      )
    );

    const specific = [];
    if (e.type === "text") {
      specific.push(section("文字", null,
        selectField("级别", e.level, LEVELS.map(l => [l.key, `${l.cn} · ${l.key}`]), v => { e.level = v; renderProps(); apply(); }),
        h("label", { class: "wb-f wb-stack", style: "margin-top:6px" }, h("label", { text: "内容" }),
          h("textarea", { rows: 3, value: e.text, onfocus: pushHistory, oninput: ev => { e.text = ev.target.value; apply(); } })),
        h("div", { class: "wb-g2", style: "margin-top:6px" },
          selectField("对齐", e.align, [["left", "左"], ["center", "中"], ["right", "右"]], v => { e.align = v; apply(); }),
          h("label", { class: "wb-f" }, h("label", { text: "色" }),
            h("input", { type: "color", value: e.color || "#111111", onchange: ev => { pushHistory(); e.color = ev.target.value; apply(); } }))
        ),
        check("高度随内容", e.autoHeight, v => { e.autoHeight = v; apply(); })
      ));
      specific.push(section(`级别参数 · ${e.level}`, h("span", { text: "全局" }), levelFields(e.level)));
    } else if (e.type === "image") {
      specific.push(section("空图位", null,
        selectField("比例", e.ratio || "", [["", "自由"], ...Object.keys(RATIOS).map(r => [r, r === "4:5" ? "4:5 · 封面裁切" : r])], v => {
          e.ratio = v;
          if (v && RATIOS[v]) e.h = round(e.w / RATIOS[v]);
          renderProps();
          apply();
        }),
        h("label", { class: "wb-f wb-stack", style: "margin-top:6px" }, h("label", { text: "标签" }),
          h("input", { type: "text", value: e.label, onfocus: pushHistory, oninput: ev => { e.label = ev.target.value; apply(); } })),
        check("显示标签", e.showTag, v => { e.showTag = v; apply(); })
      ));
    } else {
      specific.push(section("外观", null,
        h("div", { class: "wb-g2" },
          h("label", { class: "wb-f" }, h("label", { text: "填充" }),
            h("input", { type: "color", value: e.fill || "#e6e6e6", onchange: ev => { pushHistory(); e.fill = ev.target.value; apply(); } })),
          h("label", { class: "wb-f" }, h("label", { text: "描边" }),
            h("input", { type: "color", value: e.stroke || "#111111", onchange: ev => { pushHistory(); e.stroke = ev.target.value; apply(); } }))
        ),
        h("div", { class: "wb-g2", style: "margin-top:6px" },
          field("线宽", num(e.strokeW, 0), v => { e.strokeW = clamp(v, 0, 40); if (e.type === "line") e.h = Math.max(1, e.strokeW); apply(); }),
          e.type === "rect" ? field("圆角", num(e.radius, 0), v => { e.radius = clamp(v, 0, 400); apply(); }) : null
        ),
        e.type !== "line" ? h("button", { class: "wb-btn is-wide", text: "无填充", style: "margin-top:6px", onclick: () => { pushHistory(); e.fill = "transparent"; e.strokeW = e.strokeW || 1; apply(); } }) : null
      ));
    }

    return [geometry, ...specific, section("操作", null,
      h("div", { class: "wb-g2" },
        check("锁定", e.locked, v => { e.locked = v; apply(); }),
        check("隐藏", e.hidden, v => { e.hidden = v; apply(); })
      ),
      h("div", { class: "wb-g2", style: "margin-top:6px" },
        h("button", { class: "wb-btn", text: "复制", onclick: duplicateSelection }),
        h("button", { class: "wb-btn is-danger", text: "删除", onclick: deleteSelection })
      )
    )];
  }

  function snapToColumn(e, mode) {
    pushHistory();
    const f = frameById(e.frameId);
    const g = gridOf(e.frameId);
    const edges = columnEdges(e.frameId);
    if (mode === "full") {
      e.x = g.margin;
      e.w = f.w - g.margin * 2;
    } else {
      const hit = nearest(e.x, edges, Infinity);
      if (hit) e.x = round(hit.t);
    }
    const node = elementNode(e);
    if (node) placeElement(node, e);
    renderProps();
    renderOverlay();
    save();
  }

  function multiSection() {
    const icon = d => `<svg viewBox="0 0 16 16">${d}</svg>`;
    const buttons = [
      ["left", '<path d="M2 2v12"/><rect x="4" y="4" width="8" height="3"/><rect x="4" y="9" width="5" height="3"/>'],
      ["centerX", '<path d="M8 2v12"/><rect x="3" y="4" width="10" height="3"/><rect x="5" y="9" width="6" height="3"/>'],
      ["right", '<path d="M14 2v12"/><rect x="4" y="4" width="8" height="3"/><rect x="7" y="9" width="5" height="3"/>'],
      ["top", '<path d="M2 2h12"/><rect x="4" y="4" width="3" height="8"/><rect x="9" y="4" width="3" height="5"/>'],
      ["centerY", '<path d="M2 8h12"/><rect x="4" y="3" width="3" height="10"/><rect x="9" y="5" width="3" height="6"/>'],
      ["bottom", '<path d="M2 14h12"/><rect x="4" y="4" width="3" height="8"/><rect x="9" y="7" width="3" height="5"/>']
    ];
    return section("对齐", null,
      h("div", { class: "wb-seg" }, ...buttons.slice(0, 3).map(([mode, d]) =>
        h("button", { title: mode, html: icon(d), onclick: () => alignSelection(mode) }))),
      h("div", { class: "wb-seg", style: "margin-top:6px" }, ...buttons.slice(3).map(([mode, d]) =>
        h("button", { title: mode, html: icon(d), onclick: () => alignSelection(mode) }))),
      h("div", { class: "wb-g2", style: "margin-top:8px" },
        h("button", { class: "wb-btn", text: "复制", onclick: duplicateSelection }),
        h("button", { class: "wb-btn is-danger", text: "删除", onclick: deleteSelection })
      )
    );
  }

  /* ==========================================================
     KEYBOARD
     ========================================================== */
  const typing = t => Boolean(t?.closest?.("input, textarea, select, [contenteditable='true']"));

  function onKeydown(event) {
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (key === "escape") {
      if (editingId !== null) exitEditing();
      else if (!els.typeSample.hidden) {
        const open = els.propsBody.querySelector("details.wb-lvl[open]");
        if (open) open.open = false;
        openLevel = null;
        hideSample();
      } else if (state.view.tool !== "pointer") setTool("pointer");
      else select([], false);
      return;
    }
    if (ctrl && key === "z") { event.preventDefault(); undo(); return; }
    if (ctrl && key === "d") { event.preventDefault(); duplicateSelection(); return; }
    if (ctrl && key === "a" && !typing(event.target)) {
      event.preventDefault();
      select(state.elements.map(e => e.id), false);
      return;
    }
    if (ctrl && (key === "=" || key === "+")) { event.preventDefault(); zoomTo(view().zoom * 1.25); return; }
    if (ctrl && key === "-") { event.preventDefault(); zoomTo(view().zoom / 1.25); return; }
    if (ctrl && key === "0") { event.preventDefault(); zoomTo(1); return; }
    if (event.shiftKey && key === "1") { event.preventDefault(); zoomFit(); return; }

    if (event.code === "Space" && !typing(event.target)) {
      if (!spaceDown) { spaceDown = true; els.viewport.classList.add("is-panning"); }
      event.preventDefault();
      return;
    }
    if (typing(event.target)) return;

    if (key.startsWith("arrow")) {
      event.preventDefault();
      const step = event.shiftKey ? state.grid.baseline : 1;
      nudge(key === "arrowleft" ? -step : key === "arrowright" ? step : 0,
            key === "arrowup" ? -step : key === "arrowdown" ? step : 0);
      return;
    }
    if (key === "delete" || key === "backspace") { event.preventDefault(); deleteSelection(); return; }
    if (key === "enter" && selection.length === 1 && elById(selection[0])?.type === "text") {
      event.preventDefault();
      enterEditing(selection[0]);
      return;
    }
    if (ctrl || event.altKey) return;

    const tools = { v: "pointer", h: "hand", f: "frame", r: state.view.shape, t: "text", i: "image" };
    if (tools[key]) { setTool(tools[key]); return; }
    if (key === "g") toggleView("guides", els.toggleGuides);
    else if (key === "b") toggleView("baseline", els.toggleBaseline);
    else if (key === "s") toggleView("snap", els.toggleSnap);
  }

  function onKeyup(event) {
    if (event.code === "Space") {
      spaceDown = false;
      if (!drag) els.viewport.classList.remove("is-panning");
    }
  }

  function toggleView(name, button) {
    state.view[name] = !state.view[name];
    button.setAttribute("aria-pressed", String(state.view[name]));
    for (const frameId of runtime.keys()) applyFrameVars(frameId);
    save();
  }

  /* ==========================================================
     FILE
     ========================================================== */
  const slug = v => (v || "whiteboard").trim().replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 60) || "whiteboard";

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = h("a", { href: url, download: `${slug(state.name)}-whiteboard.json` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("已导出 JSON");
  }

  function importJson(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        pushHistory();
        const next = normalize(JSON.parse(String(reader.result)));
        for (const [, rt] of runtime) rt.wrap.remove();
        runtime.clear();
        state = next;
        selection = [];
        editingId = null;
        els.boardName.value = state.name;
        syncViewButtons();
        renderAll();
        applyTransform();
        save();
        toast(`已导入「${state.name}」`);
      } catch (error) {
        toast("导入失败：不是有效的白板 JSON");
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  let toastTimer = null;
  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("is-on"), 2200);
  }

  /* ==========================================================
     BOOT
     ========================================================== */
  const els = {};
  for (const id of [
    "viewport", "world", "overlay", "marquee", "boardName", "saveState",
    "toggleGuides", "toggleBaseline", "toggleSnap", "toggleTheme", "exportBtn", "importInput",
    "layersPanel", "layerTree", "collapseLayers", "openLayers",
    "propsPanel", "propsTitle", "propsBody", "collapseProps", "openProps",
    "toolbar", "shapeCaret", "shapeMenu", "shapeIcon",
    "typeSample", "sampleName", "sampleVar", "sampleText", "sampleSize", "sampleCtx",
    "zoomIn", "zoomOut", "zoomValue", "zoomFit", "toast"
  ]) els[id] = $(id);

  function renderAll() {
    renderFrames();
    for (const frameId of runtime.keys()) {
      applyFrameVars(frameId);
      renderElements(frameId);
    }
    renderOverlay();
    renderLayers();
    renderProps();
  }

  function addFramePreset(preset) {
    pushHistory();
    const last = state.frames[state.frames.length - 1];
    const frame = {
      id: uid("f"),
      name: preset.name,
      x: last ? last.x + last.w + 120 : 0,
      y: last ? last.y : 0,
      w: preset.w,
      h: preset.h,
      header: clone(HEADER_SPEC),
      footer: clone(FOOTER_SPEC)
    };
    state.frames.push(frame);
    selection = [frame.id];
    renderAll();
    save();
    return frame;
  }

  function syncViewButtons() {
    els.toggleGuides.setAttribute("aria-pressed", String(state.view.guides));
    els.toggleBaseline.setAttribute("aria-pressed", String(state.view.baseline));
    els.toggleSnap.setAttribute("aria-pressed", String(state.view.snap));
    els.toggleTheme.setAttribute("aria-pressed", String(state.view.theme === "dark"));
  }

  function bindShell() {
    els.boardName.addEventListener("input", () => { state.name = els.boardName.value; save(); });

    for (const button of document.querySelectorAll(".wb-tool")) {
      button.addEventListener("click", () => {
        const tool = button.dataset.tool;
        setTool(tool === "rect" ? state.view.shape : tool);
      });
    }
    els.shapeCaret.addEventListener("click", event => {
      event.stopPropagation();
      const open = els.shapeMenu.hidden;
      els.shapeMenu.hidden = !open;
      els.shapeCaret.setAttribute("aria-expanded", String(open));
      for (const b of els.shapeMenu.querySelectorAll("button")) b.classList.toggle("is-on", b.dataset.shape === state.view.shape);
    });
    for (const button of els.shapeMenu.querySelectorAll("button")) {
      button.addEventListener("click", () => {
        state.view.shape = button.dataset.shape;
        els.shapeIcon.innerHTML = button.querySelector("svg").innerHTML;
        els.shapeMenu.hidden = true;
        els.shapeCaret.setAttribute("aria-expanded", "false");
        setTool(state.view.shape);
        save();
      });
    }
    document.addEventListener("click", () => { els.shapeMenu.hidden = true; });

    els.toggleGuides.addEventListener("click", () => toggleView("guides", els.toggleGuides));
    els.toggleBaseline.addEventListener("click", () => toggleView("baseline", els.toggleBaseline));
    els.toggleSnap.addEventListener("click", () => toggleView("snap", els.toggleSnap));
    els.toggleTheme.addEventListener("click", () => {
      state.view.theme = state.view.theme === "dark" ? "light" : "dark";
      syncViewButtons();
      for (const frameId of runtime.keys()) applyFrameVars(frameId);
      save();
    });

    els.exportBtn.addEventListener("click", exportJson);
    els.importInput.addEventListener("change", importJson);

    els.sampleText.addEventListener("input", () => {
      state.view.sampleText = els.sampleText.textContent;
      save();
    });
    els.sampleText.addEventListener("keydown", event => event.stopPropagation());

    const togglePanel = (panel, reopen) => {
      panel.classList.toggle("is-closed");
      reopen.hidden = !panel.classList.contains("is-closed");
    };
    els.collapseLayers.addEventListener("click", () => togglePanel(els.layersPanel, els.openLayers));
    els.openLayers.addEventListener("click", () => togglePanel(els.layersPanel, els.openLayers));
    els.collapseProps.addEventListener("click", () => togglePanel(els.propsPanel, els.openProps));
    els.openProps.addEventListener("click", () => togglePanel(els.propsPanel, els.openProps));

    els.zoomIn.addEventListener("click", () => zoomTo(view().zoom * 1.25));
    els.zoomOut.addEventListener("click", () => zoomTo(view().zoom / 1.25));
    els.zoomValue.addEventListener("click", () => zoomTo(1));
    els.zoomFit.addEventListener("click", zoomFit);

    els.viewport.addEventListener("pointerdown", event => {
      if (event.target.closest(".wb-h")) {
        const handle = event.target.closest(".wb-h");
        startResize(event, handle.dataset.dir, handle.dataset.id);
        return;
      }
      const label = event.target.closest(".wb-flabel");
      if (label) {
        exitEditing();
        select([label.dataset.frame], event.shiftKey);
        const [wx, wy] = toWorld(event.clientX, event.clientY);
        startMove(event, null, wx, wy);
        return;
      }
      onPointerDown(event, null);
    });
    els.viewport.addEventListener("wheel", event => onWheel(event, null), { passive: false });
    els.viewport.addEventListener("pointermove", event => {
      if (drag || event.target.closest(".wb-h, .wb-flabel")) return;
      const [wx, wy] = toWorld(event.clientX, event.clientY);
      const next = frameAt(wx, wy)?.id || null;
      if (next !== hoverId) { hoverId = next; renderOverlay(); }
    });
    els.viewport.addEventListener("contextmenu", event => event.preventDefault());

    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);
    window.addEventListener("resize", renderOverlay);
  }

  async function boot() {
    try {
      canvasHtml = await fetch("./whiteboard-canvas.html", { cache: "no-cache" }).then(r => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      });
    } catch (error) {
      fatal("画框文档加载失败 — 请通过本地服务器打开，而不是直接双击文件。");
      return;
    }

    // This tool has no type scale of its own; it reads the portfolio's. If the
    // spec is not one level up, say so instead of rendering an unstyled frame.
    const spec = await Promise.all(SPEC_SHEETS.map(href =>
      fetch(href, { method: "GET", cache: "no-cache" }).then(r => r.ok).catch(() => false)));
    if (spec.some(ok => !ok)) {
      fatal("找不到作品集规范样式（../css/styles.css 与 ../css/grid-system.css）。" +
            "这个工具必须放在作品集 checkout 根目录下一层，例如 Portfolio/tools/，" +
            "并通过该目录的本地服务器打开。");
      return;
    }

    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) state = normalize(JSON.parse(raw));
    } catch (error) { /* keep defaults */ }

    els.boardName.value = state.name;
    syncViewButtons();
    bindShell();
    setTool("pointer");
    applyTransform();

    if (!state.frames.length) {
      seed();
      renderAll();
      setTimeout(zoomFit, 260);
    } else {
      renderAll();
    }
    markSaved(false);
  }

  /** Boot cannot continue: replace the canvas with one readable explanation. */
  function fatal(message) {
    els.viewport.append(h("div", {
      class: "wb-fatal",
      html: `<strong>白板无法启动</strong><p>${message}</p>`
    }));
    els.layersPanel.classList.add("is-closed");
    els.propsPanel.classList.add("is-closed");
    els.toolbar.hidden = true;
  }

  function seed() {
    const frame = addFramePreset(FRAME_PRESETS[0]);
    const add = (type, props) => state.elements.push({ ...blankElement(type, frame.id), ...props });
    add("text", { x: 48, y: 200, w: 900, h: 60, level: "page", text: "Selected Works", autoHeight: true });
    add("text", { x: 1069, y: 208, w: 308, h: 24, level: "meta", text: "2020 — 2026", align: "right", autoHeight: true });
    [48, 388, 729, 1069].forEach((x, i) => {
      add("image", { x, y: 320, w: 308, h: 385, ratio: "4:5", label: `项目 ${i + 1}` });
    });
    selection = [];
  }

  boot();
})();
