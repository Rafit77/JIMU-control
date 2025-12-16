# Motions (pose sequences)

This document defines the pose-sequence concept and the editor behavior we want in the app.

## What is a Motion?
A **Motion** is a named timeline of **Frames** recorded from a real robot:
- Each Frame is a **Pose** (servo positions snapshot) plus a **duration** for reaching it.
- Many Frames chained together create an animation: walk, wave, dance, gestures, etc.

Motions are intentionally **non-code**: they’re staged/recorded and edited visually.

## Motion editor (UX requirements)

### 0) Motion header (top bar)
The editor should always show a header area with:
- Current Motion selector (switch between motions)
- Save
- Revert (discard unsaved changes)
- Delete Motion
- Test / play Motion
- Instant Stop (emergency stop)

Notes:
- Switching Motion with unsaved changes must require confirmation (or offer Save / Discard / Cancel).
- Delete must require confirmation.

### 1) Servo selection (which joints participate)
- User selects a subset of detected servos (positional servos, and “mixed mode” servos if the project supports it).
- When a selection is confirmed, the system prepares the robot for posing by hand:
  - Send `readServo` for all selected IDs to **release hold** (so the user can move joints manually).
  - If we need a “stiff/hold” mode later, expose it as an explicit toggle (do not assume `readServo` holds).

### 2) Timeline / film-strip
- UI shows a horizontal film-strip of Frames.
- A new Motion starts with **zero frames**.
- **Frame width is proportional to duration** (so timing is readable at a glance).

### 3) Record a Frame
- User physically moves the robot into a desired pose and presses **Record**.
- System reads all selected servo positions:
  - Send `readServo` for each selected servo ID (or a safe batching strategy if supported).
  - Create a new Frame containing the captured Pose.
- Frame has an editable **duration**:
  - Default: 400ms
  - Allowed: 80–5000ms

### 4) Edit a Frame
- Selecting a Frame:
  - Sends `setServoPosition` for each selected servo to move the robot into that Pose (so the user sees/feels what they recorded).
- Fine tuning:
  - Servo sliders reflect the Pose stored in the selected Frame.
  - Moving a slider updates the Pose for that servo in the Frame and sends the servo command live (with safe pacing).

### 5) Frame operations
Required operations on the timeline:
- Duplicate frame
- Copy / paste frame
- Delete frame
- Insert new frame (by recording it at the current cursor position)

## Safety & data-loss rules
- **Instant Stop** must be always visible and must immediately stop playback/commands.
- Any action that may lose work must require confirmation:
  - switching Motion with unsaved changes
  - reverting without save
  - deleting a Motion
- While a Motion is playing, destructive edits should be disabled or require stopping first.

## Runtime behavior (how Motions execute)
When playing a Motion:
- Frames are executed sequentially.
- For each Frame, issue servo set commands then wait for the Frame duration.
- Playback must obey BLE timing constraints (throttle writes; see `../protocol.md`).

Integration idea:
- Expose a runtime primitive like `playMotion(nameOrId)` so Blockly Routines can trigger it.

