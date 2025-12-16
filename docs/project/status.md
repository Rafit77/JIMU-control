# Project status

## What works today
- Electron dev shell runs (`npm run dev`)
- BLE scan/connect + boot sequence via `jimu/`
- Status parsing, battery polling, basic servo/motor/sensor calls
- Probe scripts for protocol verification (`probe/`)

## What’s planned next
- App UX: project home + project persistence
- Model config UI (discover + calibrate modules)
- Blockly integration and a minimal block set
- Runtime scheduler (parallel actions + triggers)
- Packaging/installer for Windows

## Risks / unknowns
- BLE reliability across adapters/drivers (timing/backpressure matters)
- Completing protocol coverage for all modules and commands
- Maintaining safety limits to protect hardware during experiments

