# Runtime & triggers

## Goal
Run Blockly-generated programs without blocking UI and without breaking BLE timing constraints.

## Execution model (proposal)
- A project defines multiple **actions/functions**.
- Triggers (Start/Stop, keyboard/gamepad, control panel widget events) start actions.
- Actions run concurrently via a scheduler built on timers/promises (no busy loops).

## Runtime responsibilities
- Provide a small API surface to generated code (calls into `jimu/` for IO).
- Enforce cancellation (Stop) and timeouts.
- Serialize device access via the SDK (never let generated code talk to BLE).
- Centralize logging/tracing for debugging user programs.

## Minimal SDK API the runtime should target
- Connection/session: `connect()`, `disconnect()`, `getStatus()`
- Sensors: `readUltrasonic(id)`, `readIR(id)`, `readServoPosition(id)`
- Actuation: `setServoPosition(id, deg, durationMs)`, `rotateServo(id, speed)`, `rotateMotor(id, speed)`, `setEyeColor(mask, rgb)`
- Timing/helpers: `wait(ms)`, `every(ms, fn)` (scheduler-managed)

## Motion playback (pose sequences)
Non-code “Motions” (recorded frame timelines) should be callable from generated code:
- Proposed primitive: `playMotion(motionId)` (runs sequential frames, respects cancellation, and relies on SDK pacing).
- See `../project/motions.md` for the editor requirements and the playback contract.
