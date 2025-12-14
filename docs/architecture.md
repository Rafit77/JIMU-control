# Architecture (draft)

## Experience surface
- Project home: list existing projects, open or create new; show thumbnail/name/description/last opened; search and filter by tags.
- Settings & diagnostics: theme (light/dark), Bluetooth adapter check, scan/connect to JIMU master brick, rename/alias device id, view firmware info, run connectivity test, view recent logs.
- In-project tabs: Model Config, Actions, Functions (Blockly), Control (panel builder/runtime), plus device/status drawer.

## High-level components
- Editor shell (Electron + React): hosts project browser, settings/diagnostics, Blockly workspace, control panel UI, and live logs.
- Blockly layer: default blocks + custom JIMU blocks for sensors/actuators/triggers/control-panel widgets.
- Codegen/runtime:
  - Blockly JS generator emits JS/TS.
  - Runtime sandbox executes generated code with a provided JIMU SDK (async API for BLE + timing helpers) and shared project variables.
  - Event bus dispatches triggers (start/stop, keyboard, gamepad, control panel events).
- Device layer:
  - Transport abstraction: Web Bluetooth or noble (Electron) with the same async interface.
  - JIMU API client: high-level commands (enumerate modules, read sensor, drive servo/motor, control lights, power down).
  - Device registry caches the discovered configuration (ports, module types, capabilities) and supports multiple modules active concurrently.
  - Shared `jimu` library (`jimu/jimu.js`) wraps BLE (`jimu/jimu_ble.js`), performs boot (info/probe/status/enable), maintains ping/battery polling, exposes module map/firmware ID, and offers abstractions for servos, motors, sensors, eyes, ID changes, and simple wheeled-drive helpers.
- Data layer:
  - Project store: JSON bundle with metadata, block XML, assets, control panel layout, variables, actions, model config snapshot.
  - Settings: preferred device, permissions, theme, diagnostics results, debug options.

## Project format (proposal)
- `project.json`: name, description, image ref, version, created/updated, target device id/alias, shared variables (init values), triggers -> action ids, control panel layout, capabilities snapshot, tab-specific settings.
- `blocks/`: one XML per action/procedure/function (Blockly workspace serialization).
- `assets/`: images/media for the project and control panel.
- Versioned schema so we can migrate projects later.

## Tabs
### Model Config
- Connect to master brick (Bluetooth), show device id/alias, battery, firmware.
- Run discovery: list all detected modules (servos, motors, sensors) with port ids and capabilities; support multiple modules connected simultaneously.
- Configure each servo:
  - Mode: positional servo vs continuous rotation (motor mode).
  - Direction/orientation: define forward as clockwise or counter-clockwise.
  - Motion range: min/zero/max mapped to -100 / 0 / +100 for code and UI; validate limits.
- Configure motors: direction (forward/reverse), defaults, safety limits.
- Testing panel: jog servos/motors, read sensors live, power-down commands.

### Actions
- Named motion/action presets (timed servo/motor sequences); will be specified in detail later but stored alongside functions; preview and test.

### Functions
- Blockly-based code editor for multiple functions; create/delete/rename/test per function.
- Functions can call actions or other functions; share project-level variables and device context.
- Toolbox includes: Variables, Logic, Loops, Math, Sensors, Actuators, Control Panel, Gamepad, Triggers, Custom Actions.

### Control
- Grid/canvas with two modes:
  - Edit (default): add/move/resize/delete widgets, configure bindings, set labels/colors/ranges, link to keyboard/gamepad.
  - Run: active only when brick is connected; widgets emit events, indicators update from variables/sensors.
- Widgets and options:
  - Button: label, optional keyboard shortcut; executes function or action on press/release; configurable binding mode.
  - Slider: horizontal/vertical; min/max, step, invert, snap-to-center or free; can bind to gamepad axis; executes code on change.
  - Virtual joystick (2-axis): analog values; can bind to gamepad (analog/digital) or arrow keys; executes code on change.
  - Switch (toggle): two-position; executes code on change and can be read from code; named state labels.
  - Indicators: LED/color indicator; numeric display bound to variable or function output.
- Bindings: keyboard keys, gamepad buttons/axes, control-panel interactions all emit triggers routed through the event bus.

## Control flow and triggers
- Triggers: start, stop, keyboard key, gamepad button/axis, control panel button/slider/joystick/switch change.
- Each trigger maps to a named action or function. Actions run independently with shared variables and device session.
- Scheduler keeps per-action timers for `wait`, `wait until`, and `repeat until` without blocking other actions.

## Execution model
- Generated code runs inside a sandboxed runtime with provided SDK functions:
  - Sensor reads: `readUltrasonic`, `readIR`, `readTouch`, `readServoPosition`, `readControlInput`, `readGamepad`.
  - Actuation: `setServoPosition(id, pos, duration)`, `rotateServo(id, dir, speed)`, `powerDownServo(id)`, `rotateMotor(id, dir, speed)`, `powerDownMotor(id)`, `setIndicator(id, value|color)`.
  - Timing: `wait(ms)`, `waitUntil(predicate)`, `repeatUntil(predicate, body)`.
- Runtime ensures BLE commands are serialized per device constraints and retried on transient errors; device session shared across tabs during Run mode.

## UI layout (concept)
- Project home: list/create projects, quick actions for settings/diagnostics.
- In-project: left project tree (actions, functions, control panel, assets), center Blockly workspace or control grid, right live device status (connection state, module map), console/logs, control panel preview; bottom Start/Stop/connect/simulator toggle.

## Extensibility hooks
- New blocks defined via JSON/JS descriptors plus generator functions.
- Device layer plugin: add new module type by implementing capability descriptor + command mapping.
- Simulated device backend for unit tests and offline demos.

## Testing strategy
- Unit tests: block generators, runtime scheduling, device command encoding/decoding, widget bindings.
- Integration: simulated device to validate sequences for servos/motors/sensors and control-panel triggers.
- Manual: connect to real JIMU via BLE, verify discovery, actuation, sensor read latency, control-panel run mode, and error handling.
