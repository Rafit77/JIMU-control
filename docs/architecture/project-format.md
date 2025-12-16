# Project format (save/load)

## Goals
- Human-debuggable files (git-friendly where possible)
- Versioned schema (migrations later)
- Assets (images/sounds) stored alongside the project

## Proposed on-disk layout
```
MyProject/
  project.json
  blocks/
    routines/
      main.xml
      drive.xml
  motions/
    wave.json
  assets/
    thumbnail.png
    panel-background.png
```

## `project.json` (proposal)
- Metadata: name, description, created/updated, schemaVersion
- Hardware target: preferred brick id/name (optional)
- Model snapshot: last accepted module discovery/status
- Calibration/settings: servo/motor limits + modes
- Variables: initial values + types
- Triggers: mapping of Trigger → Routine
- Control panel: grid/layout + widget definitions/bindings

## Model snapshot (from Model Config tab)
Model Config maintains a “hardware snapshot” inside the project so the rest of the app (Motions/Routines/UI) can:
- know which modules exist and which are currently missing
- apply per-servo/motor limits and calibration
- detect composition changes and require user confirmation

### Proposed fields
- `hardware.connectedBrick`: last connected brick id/name
- `hardware.firmware`: firmware string (from status)
- `hardware.battery`: last-known `{ volts, charging }` (optional)
- `hardware.modules`: last accepted module discovery/status (IDs + masks)
  - `servos`, `motors`, `ir`, `ultrasonic`, `eyes`, `speakers`
  - `masks` (raw discovery masks, used for composition-change detection)
- `hardware.invalidModules`: modules referenced by the project but missing on the current brick (for UI warnings)
- `calibration.servoConfig[id]`:
  - `mode`: `servo` | `motor` | `mixed`
  - `min`, `max` (degrees -120..120)
  - `maxSpeed` (1..1000 for continuous rotation)
  - `dir` (`cw` / `ccw`)
- `calibration.motorConfig[id]`:
  - `maxSpeed` (1..150)
  - `dir` (`cw` / `ccw`)

Example (sketch):
```json
{
  "schemaVersion": 1,
  "name": "MyProject",
  "hardware": {
    "connectedBrick": { "id": "aa:bb:cc", "name": "JIMU2" },
    "firmware": "Jimu_p1.79",
    "battery": { "volts": 7.812, "charging": false },
    "modules": {
      "servos": [1, 2, 3],
      "motors": [1, 2],
      "ir": [1],
      "ultrasonic": [1],
      "eyes": [1],
      "speakers": [],
      "masks": { "servos": [0, 0, 0, 7], "motors": 3 }
    },
    "invalidModules": { "servos": [4] }
  },
  "calibration": {
    "servoConfig": {
      "1": { "mode": "servo", "min": -120, "max": 120, "dir": "cw", "maxSpeed": 1000 }
    },
    "motorConfig": {
      "1": { "maxSpeed": 150, "dir": "cw" }
    }
  }
}
```

