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
Status: complete (2025-12-19)
- Blockly workspace embedded in app (Routines tab)
- Block set MVP: control flow + math + variables + sensors + movement + show + debug
- Run/Stop controls and trace output
- Specification: `docs/project/routines.md`

## Milestone 4 — “Controller”
- Create visual controler designer (buttons, slider, joystick, indicator(led), display(number))
- routine backgroud execution (paralel)
- Widgets (button/slider/joystick) + triggers for routines
- Keyboard/gamepad events triggers for routines
- timers (repeated events like every 100ms) as triggers for routines
- Specification: `docs/project/controller.md`

## Milestone 5 — “Actions”
- Actions workspace in app
- record / play / edit Action
- allow routines to call Actions,
- allow Action instead of routine in triggers (in controler)

## Milestone 6 — “Distribution”
- Windows installer + auto-update strategy
- Crash reporting/log export
