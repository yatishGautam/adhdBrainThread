# FocusBar

A clean Pomodoro timer built with Electron. It stays in a floating window and shows the live countdown directly in the macOS menu bar.

## Features

- Always-on-top, resizable mini window
- Live macOS menu-bar countdown
- Focus, short-break, and long-break modes
- Automatic long break after a configurable number of sessions
- Optional automatic focus/break starts
- Native desktop notifications and sound
- Current-task field
- Daily session count and cycle progress
- Timer recovery after app restarts
- Closing the window hides it; the timer continues in the menu bar
- Secure Electron setup with context isolation, sandboxing, and no renderer Node access

## Run it

You need Node.js installed.

```bash
cd focusbar-pomodoro
npm install
npm start
```

The first install downloads Electron, so it can take a little while.

## Build a macOS app

Run this command **on a Mac**:

```bash
npm run dist:mac
```

The `.dmg` and `.zip` will appear inside the `dist` folder.

Because this project is not signed with an Apple Developer certificate, macOS may warn you the first time you open a packaged build. For personal use, right-click the app and choose **Open**. For distribution, add Apple code signing and notarization credentials to electron-builder.

## Menu-bar behavior

- The menu bar shows `● 24:59` during focus.
- `○` means a short break.
- `◆` means a long break.
- Click the menu-bar item to show or hide the timer.
- Right-click/control-click it for Start, Pause, Reset, Skip, and Quit.

## Keyboard shortcuts

- `Space`: Start or pause
- `R`: Reset the current interval
- `S`: Skip to the next interval
- `Esc`: Close settings

## Project structure

```text
focusbar-pomodoro/
├── assets/
│   ├── trayTemplate.png
│   └── trayTemplate@2x.png
├── src/
│   ├── main.js
│   ├── preload.js
│   └── renderer/
│       ├── app.js
│       ├── index.html
│       └── styles.css
├── package.json
└── README.md
```

## Implementation note

The timer is driven by an absolute end timestamp in Electron's main process. The renderer and menu-bar title are views of that same state. This avoids the common problem where a browser-based countdown drifts or pauses when its window is hidden.
