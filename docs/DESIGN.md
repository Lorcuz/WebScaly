---
name: WebScaly
description: Local GPU video enhancement for Chrome; a quiet instrument panel for the video you are watching.
colors:
  bg: "#101820"
  sidebar-well: "#0e161d"
  surface: "#17232d"
  surface-2: "#1c2b36"
  surface-3: "#243541"
  line: "#2b3b47"
  line-strong: "#3b4f5c"
  overlay-line: "#34414d"
  text: "#e5edf4"
  text-2: "#c2d0d9"
  muted: "#9aafbd"
  accent: "#79dfbd"
  accent-hi: "#98ebce"
  accent-ink: "#10251e"
  accent-soft: "#79dfbd17"
  accent-line: "#79dfbd4d"
  warn: "#ddc48d"
  alert: "#ff9aa4"
  alert-line: "#5a3a42"
  alert-well: "#38252b"
  video-black: "#000000"
typography:
  display:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.4px"
  headline:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.2px"
  title:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  readout:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.45
    fontFeature: "tnum"
  body:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  body-settings:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.45
  micro:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1.25
  overlay:
    fontFamily: "WebScaly Inter, Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.35
    fontFeature: "tnum"
  mono:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  xs: "4px"
  inner: "6px"
  sm: "7px"
  seg: "8px"
  md: "10px"
  lg: "12px"
  full: "999px"
spacing:
  2xs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  section: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hi}"
    textColor: "{colors.accent-ink}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "#efb4bc"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  button-danger-hover:
    backgroundColor: "{colors.alert-well}"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "34px"
  segmented:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.muted}"
    rounded: "{rounded.seg}"
    padding: "2px"
  segmented-selected:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.accent}"
    rounded: "{rounded.inner}"
    height: "30px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 10px"
    height: "28px"
  chip-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  status-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  rows-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "38px"
  nav-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
  tool-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.micro}"
    rounded: "{rounded.seg}"
    padding: "7px 2px 6px"
  tool-button-pressed:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "20px"
    width: "420px"
  player-toolbar:
    textColor: "{colors.text}"
    typography: "{typography.micro}"
    rounded: "9px"
    padding: "4px"
  comparison-pill:
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    padding: "5px 12px"
    width: "290px"
  hud:
    textColor: "{colors.text}"
    typography: "{typography.overlay}"
    rounded: "{rounded.md}"
    padding: "8px 10px 9px"
---

# Design System: WebScaly

## Overview

**Creative North Star: "The Quiet Instrument Panel"**

WebScaly is used for a few seconds at a time, mid-video, often in a dim room. The interface behaves like a well-made instrument panel beside the picture: a dark slate field, flat surfaces separated by hairlines, and a single mint accent that marks only what is on, selected or live. Everything else is grey-blue and quiet, so a glance answers "is it running, on which engine, at what size and speed?"

Density is compact and even. The popup is a fixed 360 px column with no scrolling in resting states; the settings page is a sidebar plus a single readable column of grouped rows. Type is Inter at three weights, sentence case throughout, tabular figures everywhere numbers change. Decoration is refused: no gradients on surfaces, no glows, no badges, no theatrical colour. A warm amber-and-cream redesign was built and rejected; the slate-and-mint world is the binding identity.

On the video itself the system shrinks to near nothing: translucent dark panels, 11 to 11.5 px labels, mint for the active state, hidden until the pointer moves, never over native controls or captions.

**Key Characteristics:**
- One dark slate field, three flat surface steps, hairline separators.
- One accent, mint, reserved for on, selected and live numbers.
- Warm sand only for warnings and pause; soft pink only for errors and blocked access.
- Inter 400/500/600, sentence case, tabular figures.
- Gently rounded corners (7 to 10 px); pills only for chips and the comparison slider.
- Flat at rest; shadows exist only under floating layers.

## Colors

A cool dark slate palette with one mint signal and two reserved state colours.

### Primary
- **Signal Mint** (accent): the only accent. Switch-on tracks and knobs, selected segment text, pressed tools, active nav item, slider fills and thumbs, live readouts (fps, GPU budget fill, slider values), links, focus outlines, caret and native accent-color. Filled mint (with Mint Ink text) is reserved for the single primary action in view.
- **Bright Mint** (accent-hi): hover state of mint buttons, links and slider thumbs. Never a resting colour.
- **Mint Ink** (accent-ink): text on filled mint buttons.
- **Mint Wash** (accent-soft) and **Mint Hairline** (accent-line): the tinted fill and border of selected chips, pressed tool buttons, suggestion strips and step numerals. The wash is about 9% mint; it reads as "selected", never as a coloured panel.

### Secondary
- **Warm Sand** (warn): warnings and pause only. Paused status dot, pressed pause button, GPU budget bar above 85% of the frame budget, adaptive-performance notes, preview labels, the notice strip (on a #2b281f well with a #514933 hairline).

### Tertiary
- **Soft Alert Pink** (alert): errors and blocked access only. Blocked status, unavailable power state on the player toolbar. Danger buttons use a softer pink text (#efb4bc) on a transparent fill with Alert Hairline (alert-line); hover fills with Alert Well (alert-well). Error messages sit on Alert Well with #65404b border and #ffc4ca text.

### Neutral
- **Slate Night** (bg): page and popup background; also the inset well behind inputs, selects and segmented controls.
- **Sidebar Well** (sidebar-well): the settings sidebar, one step darker than the page.
- **Slate Surface** (surface): cards, grouped row panels, status card, dialogs, hovered nav item.
- **Raised Slate** (surface-2): hover fill for buttons, icon buttons and contact rows.
- **Selected Slate** (surface-3): the selected segment of a segmented control; step numerals in the compatibility player.
- **Hairline** (line): every separator: panel borders, row dividers, footers, segmented outlines.
- **Strong Hairline** (line-strong): borders of buttons, inputs and selects; kbd outlines; scrollbar thumb.
- **Overlay Hairline** (overlay-line): borders and separators of in-player panels, one step lighter than Hairline so they hold over bright video.
- **Mist** (text): primary text.
- **Fog** (text-2): secondary text, quiet buttons, disclosure summaries, explanatory copy.
- **Slate Grey** (muted): labels, help, inactive segments and tools, footers, units.
- **Video Black** (video-black): letterbox behind every video and preview canvas.

### Named Rules
**The One Signal Rule.** Mint means on, selected or live. If an element is not in one of those states it is not mint. A screen at rest is mostly slate with a few mint marks.

**The Reserved State Rule.** Warm Sand is only for warning or pause and Soft Alert Pink only for error or blocked. Neither is ever used for decoration, emphasis or branding.

## Typography

**Display Font:** Inter (with Segoe UI, system-ui, sans-serif)
**Body Font:** Inter (same stack)
**Label/Mono Font:** ui-monospace, Cascadia Mono, Consolas, for diagnostic reports only

**Character:** One neutral grotesque at three weights. Hierarchy comes from size steps of one or two pixels and from weight 600, never from colour or case. Inter is bundled locally (extension CSP); on third-party pages the overlay registers it from bundled bytes under the private family name "WebScaly Inter" so host pages cannot see or override it. Font synthesis is off.

### Hierarchy
- **Display** (600, 24px, 1.2, -0.4px): settings page titles. The About intro uses a 22px variant.
- **Headline** (600, 16px, -0.2px): popup wordmark and dialog titles; the settings sidebar wordmark is 17px.
- **Title** (600, 15px): popup website host and settings group headings.
- **Readout** (600, 14px, tabular): status card resolution and fps, diagnostics fact values. Live values are mint.
- **Body** (400, 13px, 1.45): popup base and settings group descriptions. The settings page base is 14px. Prose measure 62 to 72ch.
- **Label** (500, 12px): field labels, status pill text, slider values, chips, footnotes.
- **Micro** (500, 11 to 11.5px): popup tool captions, segment sublabels, in-player toolbar, HUD, toasts, split labels (10.5px).

### Named Rules
**The Sentence Case Rule.** Every label, button, heading and status is sentence case. No uppercase, no tracking-out, no kickers or eyebrow text above headings.

**The Tabular Figures Rule.** Numbers that change (fps, resolution, milliseconds, percentages) are tabular so readouts do not jitter.

## Layout

**Popup.** A single 360 px column with 12px 14px 10px padding and a 12 px gap between blocks, in a fixed order: header (24 px logo, wordmark, status light, pause, settings), website host with its switch and access line, status card, Engine and Quality segmented rows (52 px inline label column), Fine-tune disclosure, a five-column tool row, and a hairline footer with the shortcut and version. Resting states do not scroll.

**Settings.** A 228 px sticky sidebar (full viewport height, hairline right edge) beside a main column capped at 880 px with 36px 44px 48px padding and 28 px between groups. Each group is a heading block (15 px title, muted description) over a rows panel. Rows are a two-column grid (text left, controls right, max 300 px) with 12px 16px padding and a 54 px minimum height. The page head pairs the title with an optional field (the profile selector) on the right.

**Responsive.** At 960 px the sidebar narrows to 200 px, rows stack to one column with controls left-aligned, and multi-column panels (privacy points, About grid) become single column. At 640 px the sidebar becomes a top block with a two-column nav grid, the sidebar footer hides and main padding drops to 22px 16px 32px. The compatibility player stacks its three steps at 820 px.

**Other pages.** The compatibility player is a 1180 px max column (28 px padding, 18 px gap) with a three-step strip; lab and benchmark pages are a 1150 px column sharing all tokens.

**Rhythm.** Spacing steps are 2, 4, 8, 12, 16, 24 and 28 px, with 6 and 10 px used inside dense controls.

## Elevation & Depth

The system is flat. Depth is tonal: Sidebar Well below Slate Night below Slate Surface below Raised Slate and Selected Slate, with hairlines doing the work of separation. Shadows appear only under layers that float over other content.

### Shadow Vocabulary
- **Dialog lift** (`box-shadow: 0 24px 60px -24px #000`): modal dialogs, over a #0a0f14 backdrop at 70%.
- **Tooltip lift** (`box-shadow: 0 6px 16px -8px #000`): hover and focus help bubbles.
- **HUD lift** (`box-shadow: 0 8px 24px -12px #000`): the performance HUD over video.
- **Live ring** (`box-shadow: 0 0 0 3px #79dfbd26`): a crisp, unblurred ring around the popup status dot while enhancing. It is a state mark, not a glow.

### Named Rules
**The Flat Surface Rule.** Cards, rows, buttons and inputs carry no shadow and no gradient. If a surface needs to stand out, step its tone or give it a hairline.

## Shapes

Gently rounded and consistent: 7 px on buttons, inputs, selects, nav items, messages and toasts; 8 px on segmented controls and tool buttons (6 px on the selected segment inside); 10 px on cards, row panels, preview frames and the HUD; 12 px on dialogs; 9 px on the in-player toolbar. Full pills only for chips, the comparison slider bar and slider tracks. Status dots are 6 to 7 px circles. Every container edge is a 1 px hairline; there are no thick borders and no offset shadows.

Icons are Tabler outline icons at 16 to 18 px with a 1.8 stroke, inline SVG, coloured by currentColor. The logo is the three ascending curved scale plates mark in mint, used at 24 px in the popup header and larger in the sidebar and About.

## Components

### Buttons
Calm, outlined, compact.
- **Shape:** gently rounded (7px), 32 px tall (28 px small), weight 500.
- **Primary:** filled Signal Mint with Mint Ink text, weight 600. One per view: "Allow on this website", "Approve", "Add website".
- **Secondary:** transparent with a Strong Hairline border and Mist text; hover fills Raised Slate.
- **Quiet:** borderless, Fog text, brightening to Mist on hover.
- **Danger:** transparent, soft pink text and Alert Hairline; hover fills Alert Well.
- **Disabled:** 45% opacity, default cursor.
- **Icon button:** 30 px square, borderless, Slate Grey icon; hover fills Raised Slate. A pressed pause button turns Warm Sand.
- **Focus:** 2 px Signal Mint outline, 2 px offset, on every control.

### Switches
- 34 x 20 px track, slate #30434f with a #516774 border at rest; on, the track is deep mint #246b56 with a mint border and the 12 px knob slides 14 px and turns mint. The whole label row is the hit target.

### Segmented controls
- A native radio group in a Slate Night well with a Hairline border (8px radius, 2 px padding). Options are Slate Grey; the selected option fills Selected Slate with mint text. The tall variant adds a muted sublabel line (Engine: "Spatial Detail / Light, any video").

### Sliders
- 4 px pill track in #3a505d, filled mint from the start (or from the centre for signed values like vibrance), 14 px mint thumb, mint numeric value right-aligned above.

### Chips
- **Style:** pill, Hairline border, Fog text, 12 px weight 500.
- **State:** selected (aria-pressed) takes Mint Wash fill, Mint Hairline border and mint text. Used for presets.

### Cards / Containers
- **Corner Style:** 10px.
- **Background:** Slate Surface on Slate Night.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1 px Hairline; rows inside a panel are divided by Hairline.
- **Internal Padding:** 10px 12px for the popup status card; 12px 16px for settings rows.

### Inputs / Fields
- **Style:** Slate Night fill, Strong Hairline border, 7px radius, 34 px tall; selects carry an inline Slate Grey chevron.
- **Focus:** 2 px mint outline; hover lightens the border.
- **Disabled:** 50% opacity.

### Navigation
- Settings sidebar: 38 px rows with a Tabler icon and label, Slate Grey at rest, Slate Surface fill on hover, Slate Surface fill with mint text for the current page. No indicator bars. On narrow screens the nav becomes a two-column grid.

### Status card (signature)
The popup's single flat readout: engine and backend label, in-to-out resolution as a Readout, mint fps, GPU time against the frame budget, skipped frames, and a 3 px budget bar that is mint and turns Warm Sand above 85%. When blocked, its border turns Alert Hairline and the label turns pink.

### Status light
A 7 px dot plus a word ("Enhancing", "Standby", "Blocked", "Paused") in the popup header. Mint with the live ring when enhancing, grey on standby, Warm Sand when paused, pink when blocked.

### Tool row
Five equal tool buttons (icon over an 11.5 px caption) at the bottom of the popup: Compare, Original, Controls, HUD, Snapshot. Pressed tools take the Mint Wash and mint text.

### In-player overlay
Isolated so the host page cannot style or capture it.
- **Toolbar** (isolated iframe): a 9px-radius translucent dark panel with an Overlay Hairline border and 4 px padding; 28 px transparent buttons and selects, 16 px icons, thin vertical separators. The power button reads "WebScaly" and is mint when on, grey when off and pink when unavailable.
- **Comparison slider** (isolated iframe): a 290 px pill with "Original" in grey and "Enhanced" in mint either side of a 3 px track and 13 px mint thumb.
- **HUD** (shadow root): a 10px-radius translucent panel at the top-left with engine, backend, size, source and enhanced fps, GPU time and skipped frames in a two-column list, plus a 4 px budget bar. Never interactive.
- **Toasts** (shadow root): a 7px-radius panel centred just below the top control band (14 px from the top when no controls are shown), never behind the toolbar or slider; it fades and settles 6 px in 180 ms, and the changed value is mint.
- **Toolbar badge** (Chrome's action badge, per tab): ON on mint `#79dfbd`, ! on pink `#ff9aa4`, II on sand `#ddc48d`, dark slate text.
- **Split labels** (shadow root): 1 px mint divider with "Original" and "Enhanced" labels on 5px-radius panels, 96 px from the top in player layout (clear of the toolbar) and 10 px from the top in preview layout.
- **Behaviour:** controls auto-hide after 2.6 s without pointer activity, like native player chrome; nothing ever catches clicks over native controls or captions.

## Do's and Don'ts

### Do:
- **Do** keep mint for on, selected and live values only, and one filled mint button per view.
- **Do** separate with 1 px hairlines and tonal steps (Sidebar Well, Slate Night, Slate Surface, Raised Slate) rather than shadows.
- **Do** set every label in sentence case Inter, with tabular figures on any number that changes.
- **Do** keep radii between 7 and 10 px, with 12 px for dialogs and full pills only for chips and the comparison bar.
- **Do** give every control a 2 px mint focus outline, honour reduced motion, and keep forced-colors fallbacks (system colours for switches, segments and the status card).
- **Do** use Tabler outline icons at a 1.8 stroke, inline and coloured by currentColor.
- **Do** keep in-player UI translucent, small (11 to 11.5 px) and hidden until the pointer moves; isolate interactive parts in frames and passive parts in a shadow root.

### Don't:
- **Don't** use gradients, glows or blurred coloured shadows on surfaces; the only gradients are slider fills and the loading shimmer.
- **Don't** use Warm Sand or Soft Alert Pink for anything but warning/pause and error/blocked.
- **Don't** add uppercase labels, letter-spaced kickers, eyebrows or badges.
- **Don't** reintroduce the rejected warm amber, velvet and cream palette.
- **Don't** place overlay UI over native player controls or captions, or let it receive clicks meant for the player.
- **Don't** load fonts from the network; Inter ships with the extension.
- **Don't** alter the WebScaly name or the three-plate logo mark.
