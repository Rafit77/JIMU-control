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
- Motors, IR, Ultrasonic, Eyes, Speakers (lists)

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
- Missing modules should be shown as invalid (red).
- Newly detected modules should be shown as “extra” (green) and blocked from use until accepted.
- If a module is referenced by Motions or Routines it must not be silently removed; keep it invalid until reintroduced or removed from the project.

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

### IR / Ultrasonic sensor panels
Clicking an IR/Ultrasonic sensor should open a live read panel:
- Poll ~5Hz and show values (single in-flight request; no overlapping polls)
- Ultrasonic shown in cm (calibrated)

## Planned direction
- Model snapshot should become part of the saved project schema: `docs/architecture/project-format.md`
- This tab should evolve into a safety limitation and troubleshooting workspace:
  - servo positional range limitation (model safety)
  - servo rotation speed limitation (model safety)
  - live sensor readouts with units/scaling
  - motor safety limits
