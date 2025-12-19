# Controller (Control Panel Designer)

This document specifies Milestone 4: a **Controller** tab that lets the user design a control panel (design mode) and then run it (run mode) to trigger routines and provide live inputs to running routines.

## Goals
- Create a **grid-based control panel** with draggable/resizable widgets (design mode).
- Switch to **run mode** where the layout is locked and widgets are interactive.
- Allow multiple routines to run **in parallel** (background execution).
- Allow routines to read controller widget state via `getSlider(name)`, `getJoystick(name, axis)`, `getSwitch(name)`.

## Recommended open source libraries

### Grid / layout (React)
Primary recommendation:
- **react-grid-layout** (MIT)
  - Very common for dashboard-like UIs.
  - Supports drag + resize, responsive layouts, grid snapping.
  - Natural fit for “Design/Run” mode (toggle `isDraggable` / `isResizable`).

Alternatives:
- **Gridstack.js** (MIT) (with a React wrapper or manual integration)
  - Mature drag+resize grid system; works great in plain DOM.
  - More imperative API; React integration may require extra care.
- **react-rnd** (MIT)
  - Drag+resize elements freely (not grid-first).
  - If we want strict grid snapping + responsive layout, it’s more work than `react-grid-layout`.

### Drag/drop from a palette
- **dnd-kit** (MIT) for “drag widget type from a toolbox into the grid”.

### Joystick widget
- **nipplejs** (MIT) for an on-screen joystick (touch + mouse friendly).

### Keyboard / Gamepad triggers
- Keyboard: browser events (`keydown`/`keyup`) are enough for MVP.
- Gamepad: standard Web Gamepad API (no dependency needed).

## Design mode vs Run mode

### Design mode
- Grid shows drop targets.
- Widgets can be moved/resized.
- Clicking a widget opens its configuration (name, behavior, bindings).
- No routines are triggered automatically (unless explicitly testing a widget).

### Run mode
- Layout is locked (no move/resize).
- Widgets are interactive and publish their live state to a **Controller State Store**.
- Widget events can start/stop routines via bindings (button press, switch toggle, etc.).

## Controller State Store (shared RAM)
Controller widgets should publish their state to an in-memory store (similar to global variables):
- `slider:<name> -> number`
- `joystick:<name>.x -> number`, `joystick:<name>.y -> number`
- `switch:<name> -> boolean`
- `indicator:<name> -> color`
- `display:<name> -> value`

Routines read those values via blocks:
- `get slider [name]`
- `get joystick [name] [x|y]`
- `get switch [name]`

Important:
- Controller state is runtime-only RAM state.
- It is not treated as “routine changed/unsaved”.

## Routine execution in background (without Blockly UI)
Yes, routines can (and should) run without the Blockly visual workspace.

Recommended architecture:
- Blockly XML (`routines/<id>.xml`) is the **editor source of truth** for editing.
- On **Project → Save**, generate and persist a compiled JS form per routine (e.g. `routines/<id>.js`) OR store compiled JS in `project.json`.
- The Controller tab runs routines using the compiled JS and the same `api` surface (JIMU commands, variables, controller inputs).

Why a “runner” is needed:
- Blockly UI is only for editing/highlighting.
- Runtime needs a scheduler/cancellation layer:
  - run multiple routines concurrently
  - route logs/trace
  - stop routines (Cancel token)
  - enforce JIMU BLE “single command at a time” constraint (queue)

Debugging note:
- Block highlighting requires the Blockly workspace.
- Background execution can run with `debug=false` (no highlight) and still log to trace.

## Bindings / triggers (MVP proposal)
Bindings live on widgets and define which routine(s) to run.

Suggested MVP bindings:
- Button:
  - onPress → start routine
  - onRelease → stop routine
- Switch:
  - onOn → start routine
  - onOff → stop routine
- Slider:
  - publish live value; optional threshold trigger later
- Joystick:
  - publish live x/y; optional deadzone + rate limit
- Timer trigger:
  - every N ms → start routine (or call a “tick” routine)
- Keyboard/gamepad:
  - map a key/button/axis to a widget or directly to a routine trigger

## Suggested saved format (proposal)
Store controller design in `project.json` (schema TBD), e.g.:
- `controller: { mode, layout, widgets, bindings }`

Each widget:
- `id`, `type`, `name`
- layout: `x,y,w,h` (grid units)
- props: type-specific config (min/max, colors, labels)
- bindings: list of triggers → routine ids

## Open questions
- Grid resolution: fixed (e.g. 12 columns) vs user configurable?
- Naming rules for widgets (must be unique per project)?
- Background routine concurrency limits (how many routines at once)?
- Should controller widget states be persisted between runs or reset on connect?
