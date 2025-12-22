# JIMU Control

Block-based programming and live control app for **UBTECH JIMU** robots (Windows-first). Build Blockly programs, connect over Bluetooth to a Master Brick, and drive servos/motors + read sensors in real time.

> Not affiliated with UBTECH. This project documents and implements a reverse‑engineered JIMU BLE protocol.
> Asked UBTECH for extra functions in uKit EDU official app, never heard response.

## What you get
- **Desktop app** (Electron + React + Vite) designed for education and for fun + quick prototyping.
- **Device SDK** in `jimu/` that handles scan/connect/boot/status + common module commands.
- **Protocol documentation** in `docs/protocol.md` (public, working draft).
- **Probe scripts** in `probe/` for reverse-engineering and validating commands - DO NOT USE, WRONG USSAGE CAN DAMAGE YOUR JIMU!

## Hardware (photos)

![JIMU Master Brick](docs/media/hardware/jimu-master-brick.png)
![JIMU modules](docs/media/hardware/jimu-modules.png)
![Example model](docs/media/hardware/jimu-model.png)
![Example model](docs/media/hardware/6-wheeler.png)

## App screenshots

![Project home](docs/media/screenshots/project-home.png)
![Model config](docs/media/screenshots/model-config.png)
![Blockly editor](docs/media/screenshots/blockly.png)
![Controller](docs/media/screenshots/control-panel.png)
![Action](docs/media/screenshots/action.png)

## Project status
- **Today (works in repo):** Most implemented: Electron shell, BLE scan/connect, boot/status parsing, battery, live Model Config panels, and real project save/load/edit (stored under `./jimu_saves/`), Actions editor + playback, Blockly Routines workspace with JIMU blocks, runtime scheduler (triggers), Controller widgets/bindings.
- **Next (app direction):** Tests... a lot of tests.
- **Known gaps:** installer/packaging, not tested.

More detail: `docs/project/status.md`

## Download & run (Windows)
Prereqs: Windows 10/11, Bluetooth adapter, Node.js LTS.

1) Clone  
`git clone https://github.com/<your-org>/JIMU-control.git`  
or download everything as zip and unpack
`cd JIMU-control`

2) Install deps  
`npm install`

3) Run dev (Vite + Electron)  
`npm run dev`

 Ctrl+Shift+I  to show dev console for error checking

4) Build + run production shell  
`npm run build`  
`npm start`

Troubleshooting and BLE notes: `docs/getting-started/windows.md`

## Documentation
- Start here: `docs/index.md`
- Architecture (overview + links): `docs/architecture.md`
- JIMU Bluetooth protocol (reverse‑engineered): `docs/protocol.md`
- Scan captures/raw notes: `docs/scan_result.md`

## Contributing
- Workflow + doc conventions: `docs/contributing.md`

## AI Support
- This project was created by AI working under my supervision. 
- I don't write JavaScript programs, but I know a bit about software engineering and low-level protocols.
- For those curious, creating a system like this takes about two weeks of work and dozens, sometimes hundreds, of prompts per day.
- I reached the ChatGPT business limit several times.
- I was curious... what can be achieved with AI these days if it's properly supervised.

## Dislamer
- I'm not responslible for any damage to your JIMU.
- PROBES - DON'T use! It is posible to pernamently change configuration of your JIMU parts with "probes" from probe folder. Don't use them if you are not 100% sure that you are ready for conseqences! Worst case scenario: your modules will no longer be detected by JIMU!!!

## License
See `LICENSE`.
