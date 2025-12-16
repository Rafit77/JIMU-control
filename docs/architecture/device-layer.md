# Device layer (SDK + BLE)

## Goal
Provide a single, tested API for the app/runtime to control a real JIMU brick, hiding:
- BLE discovery/connection quirks
- boot sequence + keep-alives
- command pacing/retries
- parsing frames/acks/errors

## Code locations
- High-level SDK: `jimu/jimu.js`
- BLE client + frame parsing: `jimu/jimu_ble.js`
- Reverse-engineering probes: `probe/`

## What the SDK does today
- Connect + boot: `0x36` (info) → `0x01` (probe) → `0x08` (status) → `0x71` (enable) → `0x27` (battery)
- Keep-alive: periodic `0x03` ping + optional battery polling
- Parse status: firmware string + bitmasks for detected modules (servos, IR, eyes, ultrasonic, speaker, motors)
- Common commands:
  - Servos: set position (`0x09`), read (`0x0B`), continuous rotate (`0x07`)
  - Motors: rotate (`0x90`)
  - Sensors: IR/ultrasonic read (`0x7E`)
  - Eyes: solid color + segments (`0x79`)
  - IDs: change peripheral (`0x74`) and servo (`0x0C`) IDs

## Constraints we must respect
- **Write spacing**: bursts below ~25ms can drop responses; throttle and retry (see `../protocol.md` timing notes).
- **Notification parsing**: device can concatenate multiple frames into one notification; parser must split `FB ... ED`.
- **Backpressure**: always subscribe to notifications and drain them; otherwise writes can “stall”.

## Design contract (for UI/runtime)
- All public SDK calls are async and return decoded results or a typed error.
- The SDK owns command serialization and pacing.
- The SDK emits events (status/battery/frame/errors) for UI telemetry without coupling UI to protocol details.
