# Project controls

This document describes the project bar and safety controls that are shared across tabs.

## Required controls (target UX)
- **Thumbnail**: when clicked, select picture; resize to 64x64 on import and store as `assets/thumbnail.png`.
- **Project name**
- **Project description** (textarea)
- **Battery indicator**: show live battery voltage and an estimated percent in the project bar (updates about every 30s); low-battery (<10%) should be shown in red.
- **Dirty state**: show unsaved changes and confirm on actions that would lose changes (close project, open another project).

### When no project is open
- **Project picker**: list saved projects (name, short description, thumbnail)
- **Create project**: create new project (name + optional description + thumbnail)

### When a project is open
- **Close project**: if connected, stop all, turn off all LEDs, disconnect; if dirty, ask whether to save.
- **Edit project**: change name/description/thumbnail; allows Save | Cancel | Delete.
- **Save**: write the current project to disk (no prompts if already has a path).
- **Save As**: pick a new project folder/file and write to it.
- **Revert**: reload the project from disk; any open calibration/config panels (e.g. servo/motor) must immediately reflect the reloaded values (or be closed if the module is no longer detected).

## Project storage rules
- Projects stored in `./jimu_saves/`
- Store the brick id/name used for the project; if the same brick is found during scan, preselect it for connect.
- Save model snapshot + calibration:
  - Module list snapshot with IDs saved to project file
  - Servo calibration (mode [servo | motor | mixed], range limits, speed limit, reverse)
  - Motor calibration (speed limit, reverse)

## Emergency Stop
Always-visible red button on the right side of the project bar.

Behavior:
- Immediately stop any motion/playback and cancel running routines.
- Make the robot safe:
  - Release servos (in this project, `readServo` / `readServoPosition(0)` is used as a “release hold” operation).
  - Stop all motors (send speed = 0 for each detected motor).
  - Stop all continuous servo rotations (send rotate velocity = 0 for detected servos that are in motor/mixed mode, or simply for all servos if mode is unknown).
  - Turn off LEDs (eyes + ultrasonic LEDs).
- Must work even if a tab is mid-operation; no confirmation dialogs.

Notes:
- Emergency Stop should not disconnect by default (disconnect is a separate control).
- Log the emergency stop action and any errors.
