# Desktop Companion

A local-first animated desktop companion for Windows, by Kur1sho.

Characters live on your taskbar, pop up when summoned, and (in later phases) talk with real personalities, dance to your music, play games with you, and do safe tasks you approve. Your data stays on your PC.

![Placeholder Robotico](docs/robotico-placeholder.png)

## What works so far

- A transparent, always-on-top overlay that covers the screen but lets clicks through everywhere except the character
- The character stands on top of the taskbar and pops up out of it with a little bounce and a wave
- A placeholder **Robotico** built from simple shapes until the real model is ready
- Load any **VRM** model (VRoid Studio, Blender) from the tray menu, or drop one in `assets/characters/` to load it on start
- Idle life: breathing, blinking, and the head follows your mouse
- Drag the character left and right along the taskbar
- Double-click the character, or click the tray icon, to summon it again
- **Talk to it**: click the character (or press Ctrl+Shift+T) and type. It answers in a speech bubble, in character, with matching facial expressions
- Two personalities: **Robotico** (loud, cocky little robot) and **Suzu** (tsundere, placeholder name)
- **Works out of the box**: a built-in AI brain runs on your PC (GPU if available), downloaded once on first launch, then offline. It picks the smartest brain your PC can run (Qwen3 4B with a graphics card, about 2.5 GB; Qwen3 0.6B on the processor otherwise), both Apache-2.0 so the app can be sold. No accounts, keys or extra installs
- Optional in Settings (tray menu): **Ollama**, or your own key for **Claude**, **OpenAI**, **OpenRouter** or **Gemini** for a smarter, wittier character
- **Wake word**: just say **"Hey Robotico"** (or the current character's name). You can say the question in one go ("Hey Robotico, how are you?") or wait for him to pop up. Heard and understood only on your PC; toggle it in Settings
- **Ignores typing and background noise**: a small built-in speech detector (Silero VAD, MIT licensed) tells a voice apart from keyboard clicks, so the wake word still works while you type and listening stops as soon as you stop talking
- **First-time setup**: on first launch the character downloads and prepares everything once (with a progress bar), so even the first "Hey Robotico" is instant
- **Safe actions**: "open Spotify", "set a timer for 10 minutes", "search for pancakes", "play lofi on Spotify", "pause the music", "skip this song", "turn it up". The character asks **Yes / Always / No** before anything happens (you can answer out loud if you asked by voice). Only the actions in `src/shared/actions.ts` can ever run: no shell commands, no files, and websites always ask. Everything it does is written to an activity log (tray menu → Activity log). On first run it asks once whether it can do simple things without asking (Settings → Actions to change)
- **Welcome screen**: on first launch, a grid of accounts to connect, one click each (tray menu → Connections to reopen), plus the "do simple things without asking" switch
- **Spotify playback**: "play lofi" opens the search in the Spotify app and presses play on the top result, and "play playlist Road Trip" plays that playlist from your library (or search) (via Windows' accessibility interface), so it works for everyone, free or Premium, with no sign-in
- **Runs your desktop**: "switch to Discord", "minimise Spotify", "put Chrome on the left", "make Discord full screen", "close Notepad" (closing always asks); "launch Elden Ring" or "play Minecraft" starts installed Steam games; "lock my PC", "take a screenshot" (saved to Pictures\Screenshots), "dark mode", "dim the screen", "show the desktop"
- **Copied text**: "read what I copied", "translate what I copied into Spanish", "summarise the text I copied". The clipboard is only read when you ask, and its text can never trigger actions
- **Dances to your music**: say "dance" (or "dance to this song") and the character dances to the beat of whatever your PC is playing: Spotify, YouTube, games. The sound is only measured on your PC (Windows audio loopback), never recorded. It stops when the music stops, or say "stop dancing"
- **Interrupt any time**: "Hey Robotico" cuts the character off mid-sentence and cancels any open question
- **Voice**: or press **Ctrl+Shift+Space** and talk. It stops listening when you go quiet, works out what you said on your PC (Whisper, downloaded once), and answers out loud with a voice tuned to each character, with lip sync. Ctrl+Shift+T opens the text box
- Keys are encrypted with Windows' own protection and never shown again; chat history is stored only on your PC, with a button to wipe it

## Running it on Windows

1. Install [Node.js LTS](https://nodejs.org) and [Git](https://git-scm.com)
2. Open a terminal (PowerShell) and run:

   ```powershell
   git clone https://github.com/Kur1sho/desktop-character-ai.git
   cd desktop-character-ai
   npm install
   npm run dev
   ```

   If PowerShell says scripts are disabled, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once first.

3. Robotico appears above your taskbar near the right. The teal dot in the system tray has the menu (Summon, Load VRM character, Quit).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the app with live reload |
| `npm run build` | Builds into `out/` |
| `npm start` | Runs the built app |
| `npm test` | Runs the unit tests |
| `npm run typecheck` | Checks types |

## Project layout

```
src/main/       Electron main process: overlay window, tray, click-through
src/preload/    The safe bridge between the window and the main process
src/renderer/   The 3D scene and characters (three.js + three-vrm)
src/shared/     Code used by both sides (layout maths, message names)
tests/          Unit tests
assets/         Character models (VRM files are git-ignored by default)
```

## Licence

Copyright Kur1sho. All rights reserved. The action layer will be published separately under an open-source licence.
