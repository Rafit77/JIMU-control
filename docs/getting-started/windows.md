# Getting started (Windows)

## Requirements
- Windows 10/11 with a working Bluetooth adapter
- Node.js LTS (includes npm): https://nodejs.org

## Run in dev mode
```powershell
git clone https://github.com/<your-org>/JIMU-control.git
cd JIMU-control
npm install
npm run dev
```

## Build and run
```powershell
npm run build
npm start
```

## Bluetooth troubleshooting
- Ensure Windows Bluetooth is enabled and the brick is powered on (and close the official JIMU app if it is connected).
- If scanning shows nothing, reboot Bluetooth (toggle off/on) and try again.
- If connect works but commands fail intermittently, increase command spacing (see timing notes in `../protocol.md`) and avoid rapid bursts.

