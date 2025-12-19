# Routines (Blockly MVP)

This document defines the **Milestone 3** behavior for the **Routines** tab, the Blockly editor, and the current block set.

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
- Keep routine IDs stable so other features (controller bindings, triggers, etc.) can reference routines later.

## Routines tab (panel UX)
The Routines tab is a list of routines with basic management actions.

Required UI:
- Routine list: one row per routine, showing `name` and optional summary (updated time).
- **Create routine**: create an empty routine and open it in the editor.
- **Open** routine: opens the Blockly editor for the selected routine.
- **Rename** routine: edit routine name (validation: non-empty, unique).
- **Delete** routine: must require confirmation.
- Unsaved changes prompt: when leaving the editor with changes, prompt Save / Discard / Cancel.

## Blockly editor (routine editor UX)
Opening a routine switches the Routines tab into an editor view.

### Top bar
Required controls:
- **Back** (return to routine list)
- **Run** (test routine)
- **Stop**
- **Slow** (debug stepping delay): 0ms / 100ms / 500ms / 1000ms
- **Save**
- **Rename**
- **Delete** (confirmation required)
- **Variables** (open variables manager dialog)
- Status area:
  - Connection state: Connected / Disconnected
  - Execution: Idle / Running / Stopped / Error
  - Last error message (if any)

Stop behavior:
- Pressing **Stop** cancels execution and runs a best-effort safety stop:
  - stop motors/servos (release holds)
  - turn off Eye LEDs and Ultrasonic LEDs (for modules listed in the project snapshot)

Debug behavior:
- While running, the currently executing block is highlighted in the workspace.
- The **Slow** setting adds an extra delay after each block (except `wait` / `wait until`).

### Left toolbox (block library)
MVP categories (as implemented):
- **Control**
- **Math**
- **Variables**
- **Sensors**
- **Movement**
- **Show**
- **Debug**

Notes:
- Text category is intentionally not included.
- Module selectors (IR/Ultrasonic/Eyes/Servos/Motors) are populated from the **project snapshot** (`project.json`), not live detection.

## Block catalog (as implemented)

### Control
- `if / if-else` (`controls_if`): branch based on a boolean condition.
- `repeat N` (`controls_repeat_ext`): run nested statements N times.
- `while / until` (`controls_whileUntil`): loop while/until a boolean condition is met.
- `wait [ms]` (`jimu_wait`): delay for a duration; cancellable via Stop.
- `wait until <condition>` (`jimu_wait_until`): polls until condition becomes true (50ms polling); cancellable via Stop.

### Math
- `number` (`math_number`): numeric constant.
- `arithmetic` (`math_arithmetic`): arithmetic operations (+, -, ×, ÷, power).
- `random integer from [a] to [b]` (`math_random_int`): inclusive random int.
- `constrain [value] low [low] high [high]` (`math_constrain`): clamp a number into range.
- `compare` (`logic_compare`): compare two values; returns boolean (<, ≤, =, ≠, ≥, >).
- `and / or` (`logic_operation`): boolean algebra.
- `not` (`logic_negate`): boolean negation.

### Variables
- Create variables from the Variables category (Blockly built-in).
- `set [variable] to [value]`: assign variable.
- `get [variable]`: read variable value.
- Variables dialog in the editor: Create / Rename / Delete variables.

### Sensors
- `read IR [id]` (`jimu_read_ir`) returns a number
  - Returns the raw IR reading from the brick.
- `read Ultrasonic [id] (cm)` (`jimu_read_us`) returns a number
  - Returns distance in cm.
  - Convention: if the device raw value is `0` (out of range), this returns `301.0`.
- `read servo [id] (deg)` (`jimu_read_servo`) returns a number
  - Reads current servo position in degrees.
  - Respects calibration `reverse` (returns inverted degrees if enabled).
- `battery level (%)` (`jimu_battery_percent`) returns a number
  - Returns `0..100` using the same voltage calibration as the UI battery icon.
- `battery charging?` (`jimu_battery_charging`) returns a boolean
  - True if the brick reports it is charging.
- `get slider [name]` (`jimu_get_slider`) returns a number
- `get joystick [name] [x|y]` (`jimu_get_joystick`) returns a number
- `get switch [name]` (`jimu_get_switch`) returns a boolean
  - These are planned application inputs (Controller widgets).
  - Current implementation returns `0` / `false` (placeholder).

### Movement
- `set servo position` (`jimu_set_servo_timed`)
  - Mutator block: add/remove servo rows; each row selects a servo ID and provides its target degrees.
  - Sends one `0x09` “Servo positions” command for all selected servos (clamped by calibration min/max + reverse), then waits `[duration ms]`.
  - Duration mapping: device `speed` byte uses `speed/20 = seconds` so `speed ~= durationMs/50` (rounded, clamped to `0..255`).
- `rotate servo [id] [cw/ccw] speed [x]` (`jimu_rotate_servo`)
  - Mutator block: add/remove servo ID rows (IDs must be distinct).
  - For continuous rotation (servo motor/mixed mode). Direction + speed are shared.
  - Speed is clamped using the most restrictive calibration `maxSpeed` in each direction group.
  - If some servos have `reverse=true`, the implementation splits the command into CW and CCW groups.
- `stop servo [id]` (`jimu_stop_servo`)
  - Mutator block: add/remove servo ID rows (IDs must be distinct).
  - Best-effort stop for continuous rotation. Also triggers a best-effort release via `readServo(0)` (read all).
- `rotate motor [id] [cw/ccw] speed [x] duration [ms]` (`jimu_rotate_motor`)
- `rotate motor , duration` (`jimu_rotate_motor`)
  - Mutator block: add/remove motor rows (IDs must be distinct).
  - Each row provides its own speed; negative speed reverses direction (motor protocol uses signed speed).
  - Duration is shared for all selected motors and clamped to `0..6000ms`.
  - Each motor speed is clamped to its configured `motorConfig[id].maxSpeed` and respects `reverse` (sign flips).
- `stop motor [id]` (`jimu_stop_motor`)
  - Mutator block: add/remove motor ID rows (IDs must be distinct).
  - Best-effort motor stop.
- `select action [name]` (`jimu_select_action`): placeholder for later Action playback integration.
- `emergency stop` (`jimu_emergency_stop`): immediate stop + cancels the routine run.

### Show
- `eye LED eyes [x] color [color]` (`jimu_eye_color`)
- `eye LED eyes [x] color [color] duration [ms]` (`jimu_eye_color_duration`)
- `eye LED eyes [x] color [color] scene [1..15] repeat [n] wait [bool]` (`jimu_eye_scene`)
- `eye LED eyes [x] custom <8 segment colors>` (`jimu_eye_custom`)
- `eye LED eyes [x] custom <8 segment colors> duration [ms]` (`jimu_eye_custom_duration`)
- `eye LED eyes [x] off` (`jimu_eye_off`)
- `ultrasonic LED [id] color [color]` (`jimu_us_led_color`)
- `ultrasonic LED [id] off` (`jimu_us_led_off`)
- `indicator [name] color [color]` (`jimu_indicator_color`) placeholder (Controller widgets not implemented yet)
- `display [name] show [value]` (`jimu_display_show`) placeholder (Controller widgets not implemented yet)

Notes:
- `eyes [x]` is a multi-select checkbox list populated from the project `hardware.modules.eyes` (project snapshot, not live detection).
- The `custom <8 segment colors>` block shows 8 color pickers in a compass-like layout (no labels). Layout is:
  - top row: NW, N, NE
  - middle row: W, E
  - bottom row: SW, S, SE

### Debug
- `log [value]` (`jimu_log`)
  - Writes to the routine Trace panel and also to the global Logs tab.
  - Accepts any value type.
