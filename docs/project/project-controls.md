# Project controls

This document describes the “project bar” and safety controls that are shared across tabs.

## Current implementation
- Project picker + create:
  - Create project (in-memory)
  - Select current project
  - Close project (disconnects)
- App menu (Electron):
  - File → New Project
  - File → Open Project (stub)
  - File → Save Project (stub)
  - File → Close Project

## Required controls (target UX)
- **Save**: write the current project to disk (no prompts if already has a path).
- **Save As**: pick a new project folder/file and write to it.
- **Dirty state**: show unsaved changes and confirm on actions that would lose changes (close project, open another project).

## Emergency Stop
Always-visible red button on the right side of the project bar.

Behavior:
- Immediately stop any motion/playback and cancel running routines.
- Make the robot safe:
  - Release servos (in this project, `readServo` / `readServoPosition(0)` is used as a “release hold” operation).
  - Stop all motors (send speed = 0 for each detected motor).
  - Stop all continuous servo rotations (send rotate velocity = 0 for detected servos that are in motor/mixed mode, or simply for all servos if mode is unknown).
- Must work even if a tab is mid-operation; no confirmation dialogs.

Notes:
- Emergency Stop should not disconnect by default (disconnect is a separate control).
- Log the stop action and any errors.

