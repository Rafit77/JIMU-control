# Roadmap

## Milestone 1 — “Connect & test”
Status: complete (2025-12-17)
- Device scan/connect UX in the app
- Status + battery + live logs in UI
- Basic manual controls: set servo position, rotate motor, read IR/ultrasonic

## Milestone 2 — “Project & model config”
Status: complete (2025-12-17)
- Project save/load/edit/save-as/delete + thumbnail import
- Project UI polish (no menu bar; compact project bar; battery indicator)
- Proper tab selector: Model | Actions | Routines | Controller | Logs
- Model Config saved calibration and live status colors (new/detected/missing)

## Milestone 3 — “Blockly MVP”
Status: implemented (2025-12-18)
- Blockly workspace embedded in app (Routines tab)
- Block set MVP: connect, wait, variables, if/loop, servo position, motor rotate, sensor read
- Run/Stop controls and trace output
- Specification: `docs/project/routines.md`

## Milestone 4 — “Movement”
- Movement workspace in app

## Milestone 5 — “Controller”
- Widgets (button/slider/joystick) + bindings
- Keyboard/gamepad triggers routed to actions

## Milestone 6 — “Distribution”
- Windows installer + auto-update strategy
- Crash reporting/log export
