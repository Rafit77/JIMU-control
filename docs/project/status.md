# Project status

## What works today
- Electron dev shell runs (`npm run dev`)
- BLE scan/connect + boot sequence via `jimu/` (with command serialization)
- Status parsing, battery polling (~30s), live logs/frames
- Project persistence on disk in `./jimu_saves/<projectId>/project.json`
  - Create/open/edit/save/save-as (clone)/revert/delete + thumbnail import to `assets/thumbnail.png`
- Model Config UI:
  - Live module discovery + color states (new/detected/missing)
  - Servo calibration + motor calibration saved to project
  - IR/Ultrasonic panels + LED controls
  - Eye panel with color picker + simple animations

## What’s planned next
- Blockly integration and a minimal block set (Routines tab)
- Action editor (pose-sequence timeline) and playback
- Controller widgets and bindings
- Packaging/installer for Windows

## Risks / unknowns
- BLE reliability across adapters/drivers (timing/backpressure matters)
- Completing protocol coverage for all modules and commands
- Maintaining safety limits to protect hardware during experiments

