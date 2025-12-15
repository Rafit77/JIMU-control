# JIMU Control

Visual block-based programming app for UBTECH JIMU robots. Lets users assemble Blockly programs to drive motors/servos, read sensors, and build custom control panels that trigger actions from keyboard/gamepad/control widgets.

## Goals
- Friendly Blockly-based editor for education; shareable projects with assets.
- Live Bluetooth link to a JIMU Master Brick to discover connected devices and run programs.
- Project-level variables and triggers (start/stop, control panel changes, keyboard, gamepad).
- Extensible device layer so new sensors/actuators can be added without touching the UI.

## Proposed stack (v1 scope)
- Runtime/UI: TypeScript + React + Vite packaged via Electron (Windows target first).
- Blocks: Google Blockly (Apache-2.0, GPL-compatible) with custom blocks for JIMU devices, triggers, and control panel widgets.
- BLE transport (desktop): `@abandonware/noble` via the shared `jimu` library. Web Bluetooth remains optional for future PWA work.
- State/store: Redux Toolkit or Zustand for low-boilerplate shared state.
- Packaging: Electron Builder for installers; projects stored locally as JSON.

## Application surface
- Project home: list existing projects (with search/filter), open or create new.
- Settings/diagnostics: theme (light/dark), Bluetooth adapter check, connect/rename master brick, firmware info, connectivity test, recent logs.
- In-project tabs: Model Config (device setup), Actions (motion presets), Functions (Blockly code), Control (panel builder/runtime).

## Key capabilities to cover
- Variables: declare, set, arithmetic, random.
- Control flow: if/if-else, loops, wait (ms), wait until, repeat until.
- Sensors: IR range, touch, ultrasonic range, servo position, control panel inputs, gamepad sticks/buttons.
- Actuation:
  - Servo (as positional servo): set position/duration, power down.
  - Servo (as motor mode): rotate with direction + speed%, power down.
  - Motors: rotate direction + speed, power down.
  - Control panel outputs: LED indicator, value display.
- Triggers: start/stop, keyboard key, gamepad button, control panel button/slider/joystick change.

## Tabs (at a glance)
- Model Config: connect to master brick, discover modules, configure servo mode (positional vs motor), direction, range mapping (-100/0/100), test movement and sensors.
- Actions: named, time-based servo/motor sequences for reuse.
- Functions: Blockly-defined functions; create/delete/rename/test; call actions/functions; shared variables.
- Control: grid of widgets (buttons with shortcuts, sliders, 2-axis joystick, switches, indicators) with Edit vs Run modes; bindings to keyboard/gamepad; code execution on change.

## Project model (high level)
- Project: name, description, optional image, device configuration snapshot, control panel layout, blocks/workspaces, shared variables.
- Each project defines actions (procedures) that are bound to triggers.
- Project stored as JSON with embedded block XML plus assets directory.

## Next steps (for first usable version)
- Implement Electron + React shell for Windows.
- Wire Blockly with a minimal JIMU block set (connect, model config, live sensor/servo/motor control).
- Integrate the `jimu` library (boot, status, enable, ping, battery poll) as the single device access point.
- Build Model Config tab (discover modules, show firmware/battery, jog servos/motors, read sensors live).
- Add local JSON project storage; basic project home and in-project tabs (Model Config first).
- Add reconnect logic, logging, and error handling for BLE.

## Windows quick start
1) Clone the repo  
   `git clone https://github.com/<your-org>/JIMU-control.git`  
   `cd JIMU-control`

2) Install Node.js (includes npm)  
   - Download the LTS installer from https://nodejs.org and complete setup, then reopen your terminal.

3) Install dependencies  
   `npm install`

4) Run the app in dev mode (Vite + Electron)  
   `npm run dev`
   - This runs the web UI and the Electron shell together. Ensure Bluetooth is on and the UBTECH brick is powered.
