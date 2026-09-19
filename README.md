# Free Media Downloader

Paste a link — download videos & audio in 3 steps.

- Tech: Tauri 2 + React 18 + TypeScript + TailwindCSS 4
- Platforms: Windows 11 / macOS
- License: **AGPL-3.0** (see LICENSE)

## Features

- Video & audio download with a built-in download kernel
- Direct-link downloads with HTTP Range resume (.part)
- In-page media extraction (`<audio>/<video>` and raw links)
- Parallel tasks, pause/resume, real-time progress & speed
- MP3 export (ffmpeg)
- Light/Dark themes, native look on Windows & macOS

## Usage Notice (Important)

- This tool is intended **only for content you own or are licensed to use**
  (e.g. your own published works). Please respect each platform's Terms of
  Service and local laws.
- This tool does **not** handle encrypted or DRM-protected content.
- Your use of this tool is at your own responsibility.

## Build

```bash
npm install
npm run tauri dev      # development
npm run tauri build    # package (NSIS installer / dmg)
```

The published build runs in compliance mode by default (official watermarks
kept, neutral wording). External kernel components resolved from PATH:

- `yt-dlp` — mainstream site download backend
- `ffmpeg` — audio conversion

## License

Published under **AGPL-3.0**: free to use, modify and redistribute, provided
derivatives (including network services) are released under the same license.

For **closed-source / commercial licensing** (OEM embedding, bulk collection
deployments, proprietary redistribution), contact the author via repository
issues.

## Support

- 爱发电: `(fill after publishing)`
- GitHub Sponsors: `(fill after publishing)`

## Architecture (brief)

```
src/                    Frontend (React)
  lib/recognize.ts      Share text → URL → platform detection
  lib/engine.ts         Task store (zustand) + scheduler + progress events
  views/                Main / Extract / Tasks / Settings / Onboarding
  i18n.ts               zh-CN (default) / en-US
src-tauri/src/lib.rs    Download kernel (Rust)
  douyin_resolve        Share-page resolution (anonymous ttwid + SSR parse)
  http_download         Direct download with Range resume + progress events
  backend_download      yt-dlp process bridge (--newline progress parsing)
  extract_media         In-page media extraction
  convert_mp3           ffmpeg audio export
```

## Platform Notes

- yt-dlp is a packaged Python program: its stdout is block-buffered when
  piped — always inject `PYTHONUNBUFFERED=1` or progress lines will be
  delayed until process exit;
- YouTube extraction needs a JS runtime (ship `deno` alongside for full
  format availability);
- Tauri 2 event names must not contain `://` (silently dropped) — use simple
  names like `task-progress`.
