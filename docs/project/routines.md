# Routines (Blockly MVP)

This document defines the **Milestone 3** behavior for the **Routines** tab, the Blockly editor, and the **MVP block set**.

## Concepts
- A **Routine** is a named program created with blocks (Blockly).
- A project can contain **multiple routines**.
- A routine has:
  - `id` (stable identifier; does not change on rename)
  - `name` (user-facing; must be unique within a project)
  - `workspace` (Blockly serialization, stored as XML)

## Storage (project format)
- Store each routine workspace in `routines/<routineId>.xml`.
- `project.json` stores a list of routines (id + name + timestamps). The XML is the source of truth for blocks.

Notes:
- Do not use the routine name as the filename (rename should not rename files).
- Keep routine IDs stable so other features (triggers, controller bindings) can reference routines later.

## Routines tab (panel UX)
The Routines tab is a **list of routines** with basic management actions.

Required UI:
- Routine list: one row per routine, showing `name` and optional summary (updated time, block count).
- **Create** routine:
  - Creates an empty routine with a default name like `Routine 1` (auto-increment).
  - Immediately opens it in the Blockly editor.
- **Open** routine:
  - Opens the Blockly editor for that routine.
- **Rename** routine:
  - Edit routine name (with validation: non-empty, unique).
- **Delete** routine:
  - Must require confirmation.
  - If the routine is running, Stop first (or block delete until stopped).

Unsaved changes rules:
- If a routine has unsaved changes and the user tries to switch routines / leave the editor, prompt:
  - Save / Discard / Cancel.

## Blockly editor (routine editor UX)
Opening a routine switches the Routines tab into an editor view.

### Top bar
Required controls:
- **Back** (return to routine list)
- **Run** (test routine)
- **Stop**
- **Save**
- **Rename**
- **Delete** (confirmation required; consider placing inside a menu or secondary action)
- **Variables…** (open variables manager dialog)
- Status area:
  - Connection state: Connected / Disconnected
  - Execution: Idle / Running / Stopped / Error
  - Last error message (if any)

### Left toolbox (block library)
Show Blockly toolbox categories on the left.

MVP categories (as implemented):
- **Control**: if/else, loops, wait, wait-until
- **Math**: arithmetic, random int, constrain, comparisons and boolean operators
- **Variables**: create/set/get variables
- **Sensors**: brick sensors + UI inputs (slider/joystick/switch)
- **Movement**: connect + servo/motor movement + safety + action placeholder
- **Show**: eyes + ultrasonic LEDs + controller outputs
- **Debug**: log/trace block

Notes:
- Text blocks are intentionally not included (you can still log numbers/booleans).

### Workspace + output
Required:
- Main Blockly workspace.
- A trace/log output area (bottom or right) showing:
  - timestamped runtime logs
  - last run result / error

## Block catalog (as implemented)
This section lists **all blocks currently available** in the Routines toolbox and what they do.

### Control
- `if / if-else` (`controls_if`): branch based on a boolean condition.
- `repeat N` (`controls_repeat_ext`): run nested statements N times.
- `while / until` (`controls_whileUntil`): loop while/until a boolean condition is met.
- `wait [ms]` (`jimu_wait`): delay for a duration; cancellable via Stop.
- `wait until <condition>` (`jimu_wait_until`): polls until condition becomes true (50ms polling); cancellable via Stop.

### Math
- `number` (`math_number`): numeric constant.
- `+ - × ÷` (`math_arithmetic`): arithmetic operations.
- `random integer from [a] to [b]` (`math_random_int`): inclusive random int.
- `constrain [value] low [low] high [high]` (`math_constrain`): clamp a number into range.
- `< ≤ = ≠ ≥ >` (`logic_compare`): compare two values; returns boolean.
- `and / or` (`logic_operation`): boolean algebra.
- `not` (`logic_negate`): boolean negation.

### Variables
- Create variables from the Variables category (Blockly built-in).
- `set [variable] to [value]` (built-in variable setter): assign variable.
- `get [variable]` (built-in variable getter): read variable value.
- Variables dialog in the editor:
  - Create / Rename / Delete variables.

### Sensors
- `read IR [id]` (`jimu_read_ir`) → returns a number
  - Returns the raw IR reading from the brick.
- `read Ultrasonic [id] (cm)` (`jimu_read_us`) → returns a number
  - Returns distance in cm.
  - Convention: if the device raw value is `0` (out of range), this returns `301.0`.
- `read servo [id] (deg)` (`jimu_read_servo`) → returns a number
  - Reads current servo position in degrees.
  - Respects calibration `reverse` (returns inverted degrees if enabled).
- `battery level (%)` (`jimu_battery_percent`) → returns a number
  - Returns `0..100` using the same voltage calibration as the UI battery icon.
- `battery charging?` (`jimu_battery_charging`) → returns a boolean
  - True if the brick reports it is charging.
- `get slider [name]` (`jimu_get_slider`) → returns a number
- `get joystick [name] [x|y]` (`jimu_get_joystick`) → returns a number
- `get switch [name]` (`jimu_get_switch`) → returns a boolean
  - These are planned "application inputs" (Controller widgets).
  - Current implementation returns `0` / `false` (placeholder).

### Movement
- `set servo [id] position [deg] duration [ms]` (`jimu_set_servo_timed`)
  - Sends a servo set-position command (clamped by calibration min/max + reverse), then waits `[ms]`.
  - Note: `[ms]` is currently a **timing wait**, not a closed-loop motion duration from the brick.
- `rotate servo [id] [cw/ccw] speed [x]` (`jimu_rotate_servo`)
  - For continuous rotation (servo motor mode).
  - Speed is clamped using calibration `maxSpeed` + `reverse`.
- `stop servo [id]` (`jimu_stop_servo`)
  - Best-effort stop for continuous rotation (implemented via stop+read/release).
- `rotate motor [id] [cw/ccw] speed [x] duration [ms]` (`jimu_rotate_motor`)
  - Duration is clamped by the device layer to `0..6000ms`.
  - Speed respects calibration (`motorConfig.maxSpeed` + `reverse`).
- `stop motor [id]` (`jimu_stop_motor`)
  - Best-effort motor stop.
- `select action [name]` (`jimu_select_action`)
  - Placeholder for later Action playback integration.
- `emergency stop` (`jimu_emergency_stop`)
  - Immediately requests a best-effort stop and cancels the routine run.

### Show
- `eye LED [id] color [color]` (`jimu_eye_color`)
- `eye LED [id] color [color] duration [ms]` (`jimu_eye_color_duration`)
- `eye LED [id] color [color] scene [1..15] repeat [n] wait [bool]` (`jimu_eye_scene`)
- `eye LED [id] custom <8 colors (N/NE/E/SE/S/SW/W/NW)>` (`jimu_eye_custom`)
- `eye LED [id] custom <8 colors (N/NE/E/SE/S/SW/W/NW)> duration [ms]` (`jimu_eye_custom_duration`)
- `eye LED [id] off` (`jimu_eye_off`)
- `ultrasonic LED [id] color [color]` (`jimu_us_led_color`)
- `ultrasonic LED [id] off` (`jimu_us_led_off`)
- `indicator [name] color [color]` (`jimu_indicator_color`) — placeholder (Controller widgets not implemented yet)
- `display [name] show [value]` (`jimu_display_show`) — placeholder (Controller widgets not implemented yet)

### Debug
- `log [value]` (`jimu_log`)
  - Writes to the routine Trace panel and also to the global Logs tab.
  - Accepts any value type (numbers/booleans are typical in MVP since Text blocks are not included).

## Open questions (please confirm)
1) Should the `connect` block be allowed to trigger scan, or only connect to the already-selected brick?
2) Do we want a routine-entry “hat” block (single entrypoint), or just treat the top-level stack as the routine body?
