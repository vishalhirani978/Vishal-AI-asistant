# Pixel PM — Vishal

**Pixel PM** is an Electron desktop app featuring **Vishal**, a pixel-art AI character that lives on your screen as a transparent always-on-top overlay. He's your always-on AI project manager — chat with him, ask him to send WhatsApp messages, check emails, monitor GitHub, and more.

![Vishal character pixel art](assets/character-front.png)

## Features

- **AI Chat** — Powered by Groq (Llama 3.3 70B) with automatic Gemini fallback
- **Voice Input** — Speak to Vishal via Groq Whisper (Ctrl+Alt+Space)
- **WhatsApp** — Send messages via WhatsApp Web automation (Puppeteer)
- **Instagram** — Check DMs via Instagram Web (Puppeteer)
- **Gmail** — Send emails via Gmail SMTP (nodemailer)
- **GitHub Watcher** — Polls for PRs, issues, mentions, and build status every 60s
- **GitHub Actions** — Approve PRs, comment on issues, open repos in browser
- **Browser Tools** — Open any URL, search Google, open YouTube/Gmail
- **16 Pixel Art Poses** — Mood-reactive character with walking animation and idle bobbing
- **Transparent Overlay** — Always-on-top, click-through when idle
- **Settings Panel** — Persistent position, snooze, hotkeys, notification toggles
- **Hotkeys**: Ctrl+Alt+V (summon), Ctrl+Alt+G (GitHub), Ctrl+Alt+Space (voice)

## Tech Stack

| Technology | Purpose |
|---|---|
| **Electron** ^32.0.0 | Desktop shell |
| **Groq SDK** ^1.2.0 | Primary AI (llama-3.3-70b-versatile) |
| **Google Generative AI** ^0.24.1 | Fallback AI (Gemini) |
| **Puppeteer** ^25.1.0 | WhatsApp & Instagram web automation |
| **Nodemailer** ^8.0.9 | Gmail SMTP |
| **Octokit** ^19.0.13 | GitHub API |
| **Dotenv** ^17.4.2 | Environment config |
| **electron-builder** ^24.x | Windows installer packaging |

## Getting Started

### Prerequisites

- Node.js 18+
- Windows 10+
- A Groq API key (free at [console.groq.com](https://console.groq.com))

### Installation

```bash
git clone https://github.com/vishalhirani978/pixel-pm.git
cd pixel-pm
npm install
```

### Configuration

Create a `.env` file in the project root:

```env
GROQ_API_KEY=gsk_your_key_here
GEMINI_API_KEY=your_gemini_key          # optional fallback
GITHUB_TOKEN=ghp_your_token_here        # optional
GITHUB_USERNAME=your_github_username
GMAIL_USER=your_email@gmail.com         # optional
GMAIL_APP_PASSWORD=your_app_password    # optional
```

> **Gmail App Password**: Generate one at [Google App Passwords](https://myaccount.google.com/apppasswords) (requires 2FA enabled).

### Running

```bash
# Development (with DevTools)
npm run dev

# Production
npm start
```

### Building

```bash
# Build Windows installer
npm run build

# Build portable (unpacked)
npm run build:dir
```

## Architecture

```
├── main.js                  # Electron main process — window, IPC, hotkeys, lifecycle
├── preload.js               # IPC bridge — vishalAPI exposed to renderer
│
├── agents/
│   ├── claude-brain.js      # Chat AI — Groq primary, Gemini fallback
│   ├── personality.js       # Vishal's personality system prompt
│   ├── agent-brain.js       # Intent parser — text → { action, params }
│   ├── agent-tools.js       # Tool registry — 8 registered tools
│   ├── agent-executor.js    # Confirmation flow coordinator
│   ├── whatsapp-agent.js    # WhatsApp sender via Puppeteer
│   ├── instagram-agent.js   # Instagram DM checker via Puppeteer
│   ├── gmail-agent.js       # Email sender via nodemailer
│   ├── whisper.js           # Voice transcription (Groq Whisper)
│   ├── github-watcher.js    # GitHub polling daemon
│   └── github-actions.js    # GitHub API actions
│
├── renderer/
│   ├── index.html           # Main overlay UI
│   ├── style.css            # Character, bubble, confirmation styles
│   ├── character.js         # All character logic — moods, animations, agent flow
│   ├── settings.html        # Settings panel
│   └── settings-preload.js  # Settings IPC bridge
│
└── assets/                  # 16 pixel art poses + icon
```

### Agent Flow

```
User types/says text
  → character.js: sendMessageToVishal()
    → IPC: agentParse(text)
      → agent-brain.js: parseIntent() → { action, params }
      → if chat: askVishal() → return response
      → if tool: agent-executor.js: buildConfirmation()
    → character.js: showConfirmationBubble()
      → User clicks Yes
        → IPC: agentExecute(toolName, params)
          → agent-tools.js: executeTool()
  → character.js: showChatBubble("✅ Done!")
```

Every tool requires explicit user confirmation before execution.

## Registered Tools

| Tool | Description |
|---|---|
| `open_url(url, name)` | Open any website |
| `google_search(query)` | Search Google |
| `open_youtube(search?)` | Open YouTube, optional search |
| `open_gmail()` | Open Gmail in browser |
| `open_whatsapp_web()` | Open WhatsApp Web |
| `send_email(to, subject, body)` | Send email via Gmail SMTP |
| `send_whatsapp(to, message)` | Send WhatsApp message via Puppeteer |
| `check_instagram_dms()` | Check Instagram DMs via Puppeteer |

## WhatsApp Setup

The WhatsApp agent uses Puppeteer to automate WhatsApp Web:

1. First use — a QR code will appear on the WhatsApp Web page
2. Scan it with your phone (120s timeout)
3. Session persists via Brave/Chrome user data — you stay logged in

Usage: *"Vishal, message John that I'm on my way"*

## Hotkeys

| Hotkey | Action |
|---|---|
| Ctrl+Alt+V | Summon Vishal (open chat) |
| Ctrl+Alt+G | Show GitHub summary |
| Ctrl+Alt+Space | Voice input (hold, speak, release) |

## Roadmap

- [x] WhatsApp agent (Puppeteer)
- [x] Instagram DM checker (Puppeteer)
- [ ] Contact book (name → phone/email mapping)
- [ ] Session management for web automation
- [ ] Calendar agent (Google Calendar)
- [ ] System controls (shutdown, volume, lock screen)
- [ ] Clipboard agent (save/restore notes)

## License

MIT © [Vishal Hirani](mailto:vishalhirani978@gmail.com)
