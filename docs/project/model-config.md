# Model Config tab

This tab is the “live hardware” surface: connect to a real JIMU brick, view detected modules, and calibrate per-module settings stored in the current project.

## Current behavior (as implemented)

### Connection section
- **Scan bricks** runs a ~4s BLE scan and fills the brick selector.
- **Connect** connects to the selected brick and runs boot (status → enable → battery), then updates:
  - UI `status`
  - firmware string
  - battery voltage/charging flag
  - detected modules stored into the current project
- **Refresh status** re-reads status (module discovery) and updates the current project.

Events pushed from the device:
- `jimu:status` updates detected modules in UI and in the current project.
- If the project already has a stored module layout and a new `status.masks` differs, UI asks: “Detected device composition change. Accept new layout?”
- `jimu:battery` updates battery info.
- `jimu:disconnected` resets connection state.

### Live module overview
Shows detected IDs for:
- Servos (clickable)
- Motors, IR, Ultrasonic, Eyes (clickable)
- Speakers (list)

### Servo details panel
Clicking a servo opens a panel and requests current position.

Servo units:
- UI and SDK use degrees `-120..120` (`0` center).

Stored per-servo settings (in memory, per project):
- `project.servoConfig[id]`: `mode`, `min`, `max`, `maxSpeed`, `dir`

Positional (mode `servo` / `mixed`):
- Touch-bar style slider `-120..120` with 3 draggable markers: `min`, `max`, and `test` (test is clamped to `[min,max]`)
- Test position (shows selected angle)
- Stop / release (runs `readServo` to release hold)
- Save settings into the project

Rotation (mode `motor` / `mixed`):
- Direction (`cw` / `ccw`)
- Max speed (1..1000) and a speed slider
- Test rotation
- Save settings into the project

## Desired behavior (not complete yet)

### Composition change UX
When rejecting a composition change:
- Status colors (proposal):
  - `detected` (green): in project snapshot and detected now
  - `missing` (gray): in snapshot but not detected; safe to remove only if unused
  - `error` (red): in snapshot, not detected, but referenced by Motions/Routines; cannot be removed silently
  - `new` (blue): detected now but not in snapshot; blocked from use until accepted into the project

When saving the project snapshot:
- `missing` (gray) modules are deleted from the saved snapshot
- `new` (blue) modules are added to the saved snapshot
- `error` (red) modules stay in the saved snapshot (they are in use)

### Motor details panel
Clicking a motor should open a motor panel.

Stored per-motor settings:
- `project.motorConfig[id]`: `maxSpeed`

Motor rotation:
- Direction (`cw` / `ccw`)
- Max speed (1..150) and a speed slider
- Test rotation (e.g. 5 seconds) and a Stop rotation button (speed = 0)
- Save settings; saved limits must not be exceeded by Motions or Routines.

Closing/changing motor:
- Stop motor first (speed = 0).
- If settings changed: prompt to save or discard.

### IR sensor panel
Clicking any IR sensor opens an IR-only panel:
- Poll ~5Hz and show values for all detected IR sensors (single in-flight request; no overlapping polls)

### Ultrasonic sensor panel
Clicking any Ultrasonic sensor opens a US-only panel:
- Poll ~5Hz and show values for all detected Ultrasonic sensors (single in-flight request; no overlapping polls)
- Ultrasonic shown in cm (raw `0` treated as out-of-range and displayed as `301.0 cm`)
- Ultrasonic LED: solid color test + Off (no blinking)
  - Uses RGB + `level` per `docs/protocol.md`.

### Eye details panel
Clicking an eye opens a panel for a single eye ID:
- Full-eye solid RGB test (`setEyeColor`), Off (`setEyeOff`)
- Simple animations (blink / pulse / rainbow) with Start/Stop controls

## Planned direction
- Model snapshot should become part of the saved project schema: `docs/architecture/project-format.md`
- This tab should evolve into a safety limitation and troubleshooting workspace:
  - servo positional range limitation (model safety)
  - servo rotation speed limitation (model safety)
  - live sensor readouts with units/scaling
  - motor safety limits
