# Portfolio Editor — whiteboard layout sandbox

An infinite canvas of page frames for composing layouts against the YUNSTUDIO
portfolio's own grid and type scale, before any of it becomes real content.

## Install

This tool ships **no copy of the design spec**. It reads the portfolio's real
`css/styles.css` and `css/grid-system.css` from one directory up, so it has to
live inside the portfolio checkout:

```bash
cd D:\AI-Workspaces\Portfolio
git clone https://github.com/TonySama-BoiledCabbage/Portfolio-Editer.git tools
```

Then start the portfolio's local server and open it:

```bash
python server.py
```

`http://localhost:8108/tools/whiteboard.html`

It must be served over HTTP — the tool fetches its own frame document at boot,
and drives each frame through the iframe DOM, which `file://` blocks as
cross-origin. If the spec stylesheets are not reachable at `../css/`, the tool
refuses to start and says so rather than rendering an unstyled frame.

The parent portfolio repository ignores `tools/`, so this clone stays
independent and is never deployed with the site.

## What it is not

It never reads or writes `content/portfolio-content.json` and adds no route to
the portfolio. It is entirely client-side: boards live in `localStorage` under
`yunstudio-whiteboard-v2`, with JSON export/import for anything worth keeping.

## Interaction model

Figma-like direct manipulation. One floating toolbar at bottom centre, a layers
panel on the left, a contextual properties panel on the right.

| | |
|---|---|
| `V` / `H` | 指针 / 抓手 (space also pans) |
| `F` | 画框 — drag out a page frame, or click for a 1440 × 1600 one |
| `R` | 形状 — 矩形 / 椭圆 / 直线 via the caret |
| `T` / `I` | 文字 / 空图位 |
| `G` `B` `S` | 参考线 / 基线 / 吸附 |
| `Alt` drag | bypass snapping |
| `Shift` drag | lock to one axis; on a corner handle, keep proportion |
| `Ctrl+Z` `Ctrl+D` `Ctrl+A` `Delete` | undo / duplicate / select all / delete |
| arrows | nudge 1px, `Shift` + arrows nudge one baseline |

Drag anywhere, resize from eight handles, double-click text to edit in place.
Dragging an element over another frame reparents it.

## Where the spec comes from

`whiteboard-canvas.html` loads `../css/styles.css` and `../css/grid-system.css`
in the same order as the portfolio's `index.html`, so every frame inherits the
shipped grid and type scale rather than a copy. `whiteboard-canvas.css` only
adds sandbox chrome plus overrides that stay dormant until a value is
deliberately changed.

Three consequences worth knowing:

- **Each frame is a real iframe**, so the spec's `@media` breakpoints and the
  type scale's `vw` units resolve against the *frame* width, not the window. A
  1440 frame beside a 720 frame shows the real 12-column and 4-column layouts
  side by side.
- **Snapping is the grid.** Dragging snaps an element's left / centre / right to
  the column edges and page margins, its top / centre / bottom to other
  elements, and otherwise rounds to the 8px baseline.
- **Resetting means resetting to the spec.** The reset buttons in 网格 and
  字体级别 restore what `css/grid-system.css` and `css/styles.css` actually
  ship. `LEVELS` and `SPEC_GRID` in `whiteboard.js` mirror those files; if the
  spec changes, update them together.

## Why frames use `srcdoc`

The portfolio's `vercel.json` sends `frame-ancestors 'none'` and
`X-Frame-Options: DENY` on every path. Those apply to a framed **HTTP
response**, so `src="./whiteboard-canvas.html"` is blocked wherever those
headers are present, even same-origin — `contentDocument` comes back `null`.

So `whiteboard.js` fetches `whiteboard-canvas.html` once at boot and assigns it
to each iframe's `srcdoc`. A `srcdoc` document has no response headers, so
neither directive applies, and it inherits the page CSP, which already permits
same-origin stylesheets. Relative paths inside it still resolve against the
tool's directory.

Do not change this back to `src` without checking those headers first.

## The type sample

Opening a level in 字体级别 — or touching the 级别参数 fields of a selected text
element — floats a sample against the inner edge of the properties panel. It
renders the real font stack at the real size, and follows every parameter as you
change it. `Esc` closes it. The sample string is editable and remembered.

The size it shows is **measured, not calculated**. `whiteboard-canvas.html`
carries a hidden `#wbProbe`; the tool sets `font-size: var(--type-<level>)` on
it inside the relevant frame and reads back the computed px. This matters
because the scale is fluid: the portfolio sets `scrollbar-gutter: stable` on
`html`, so a frame's `vw` unit is narrower than `width / 100` and a hand-rolled
clamp is off by roughly half a pixel.

Which frame it speaks for: the selected element's frame, else the selected
frame, else the first one — and the footer names it. The same `page` level reads
45.6px in a 1440 frame and 32px in a 720 frame, which is the point.

## Files

| File | Role |
|---|---|
| `whiteboard.html` / `.css` / `.js` | Shell, panels, toolbar, and the canvas engine |
| `whiteboard-canvas.html` / `-canvas.css` | One page frame's document and its sandbox chrome |
