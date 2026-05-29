# Pixel PM — Master Resume Prompt

Paste this into any AI (Claude, ChatGPT, etc.) to resume work on Vishal, the pixel art AI project manager.

---

## PROJECT OVERVIEW

Vishal is an Electron desktop app — a pixel art character that lives on the user's screen as a transparent always-on-top overlay. He monitors GitHub, chats via AI, and executes actions (open URLs, send emails, etc.) through an agent system with user confirmation.

**OS:** Windows 10  
**Screen:** 1536x824  
**Project path:** D:\projects\Vishal  
**Run command:** `npm run dev` (opens DevTools) or `npm start`

---

## TECH STACK

- **Electron** ^32.0.0 (Windows desktop)
- **groq-sdk** ^1.2.0 (primary AI — llama-3.3-70b-versatile)
- **@google/generative-ai** ^0.24.1 (fallback AI)
- **@octokit/rest** v19.0.13 (GitHub API — DO NOT UPGRADE, v20+ breaks CommonJS)
- **nodemailer** (Gmail SMTP)
- **puppeteer** ^25.1.0 (WhatsApp + Instagram web automation)
- **dotenv** ^17.4.2
- **electron-builder** ^24.x (for .exe)

---

## FILE STRUCTURE

```
D:\projects\Vishal
├── main.js                    # Electron main process — window, IPC, hotkeys, app lifecycle
├── preload.js                 # IPC bridge — exposes vishalAPI to renderer
├── package.json
├── .env                       # GROQ_API_KEY, GEMINI_API_KEY, GITHUB_TOKEN, GMAIL_USER, GMAIL_APP_PASSWORD
├── RESUME_PROMPT.md           # ← YOU ARE HERE
│
├── agents/
│   ├── claude-brain.js        # Chat AI — Groq primary, Gemini fallback, conversation memory
│   ├── personality.js         # Vishal's personality system prompt
│   ├── agent-brain.js         # Intent parser — sends user text to Groq, returns { action, params, confidence, reasoning }
│   ├── agent-tools.js         # Tool registry — each tool has: name, description, params (typed), requiresConfirmation, execute()
│   ├── agent-executor.js      # Coordinator — builds confirmation payload, executes confirmed tools
│   ├── gmail-agent.js         # Gmail sender via nodemailer
│   ├── whisper.js             # Voice transcription via Groq Whisper (whisper-large-v3-turbo)
│   ├── github-watcher.js      # GitHub polling (every 60s) — PRs, issues, mentions, builds
│   ├── github-actions.js      # GitHub actions — approve PR, comment, open in browser
│   ├── whatsapp-agent.js      # WhatsApp sender via Puppeteer
│   └── instagram-agent.js     # Instagram DM checker via Puppeteer
│
├── renderer/
│   ├── index.html             # Main overlay page
│   ├── style.css              # All styles — character, bubble, confirmation buttons
│   ├── character.js           # All character logic — moods, walking, voice input, agent flow
│   ├── settings.html          # Settings panel
│   └── settings-preload.js    # Settings IPC bridge
│
└── assets/
    ├── character-*.png        # 16 pixel art poses
    └── icon.ico
```

---

## ALREADY BUILT (DO NOT REBUILD)

### Working Features
- ✅ Transparent always-on-top Electron overlay
- ✅ 16 pixel art character poses + walking animations + idle bobbing
- ✅ Thought bubble UI with text input, mic, send, close buttons
- ✅ Voice input via Groq Whisper (Ctrl+Alt+Space)
- ✅ Chat AI via Groq (Ctrl+Alt+V summon)
- ✅ GitHub watcher (polling every 60s, Ctrl+Alt+G for summary)
- ✅ Settings panel with persistence (position, snooze, hotkeys, notifications)
- ✅ Mouse click-through system (vishalActive/vishalIdle IPC)
- ✅ Right-click context menu (chat, GitHub, snooze, settings, quit)
- ✅ Drag to reposition + position memory across restarts

### Agent System (Built)
- ✅ Intent parser (`agent-brain.js`) — sends user text to Groq, returns structured JSON
- ✅ Tool registry (`agent-tools.js`) — 8 tools with typed params, descriptions, requiresConfirmation
- ✅ Confirmation flow (`agent-executor.js`) — always asks "Yes/Cancel" before executing
- ✅ Confirmation bubble UI in `character.js` — shows title, description, Yes (green) / Cancel (red) buttons
- ✅ Mood reactions: thinking → pointingRight → excited → thumbsUp / ok

### 8 Registered Tools
| Tool | Description |
|------|-------------|
| `open_url(url, name)` | Open any website |
| `google_search(query)` | Search Google |
| `open_youtube(search?)` | Open YouTube, optional search |
| `open_gmail()` | Open Gmail in browser |
| `open_whatsapp_web()` | Open WhatsApp Web |
| `send_email(to, subject, body)` | Send email via Gmail SMTP |
| `send_whatsapp(to, message)` | Send WhatsApp message via Puppeteer |
| `check_instagram_dms()` | Check Instagram DMs via Puppeteer |

### Gmail Agent
- Uses `nodemailer` with Gmail SMTP (App Password required)
- Configured via `.env`: `GMAIL_USER`, `GMAIL_APP_PASSWORD`
- File: `agents/gmail-agent.js`
- Tool registered in `agent-tools.js` as `send_email`

### WhatsApp Agent
- Uses Puppeteer with WhatsApp Web to send messages
- Session persistence via Brave userDataDir
- QR code scan flow for first-time login
- File: `agents/whatsapp-agent.js`
- Tool: `send_whatsapp(to, message)`

### Instagram Agent
- Uses Puppeteer with Instagram Web to check DMs
- Session persistence via Brave userDataDir
- Detects unread conversations and reads recent messages
- File: `agents/instagram-agent.js`
- Tool: `check_instagram_dms()`

---

## ARCHITECTURE PATTERNS

### Adding a New Tool
1. Create the agent module in `agents/` (e.g., `agents/whatsapp-agent.js`)
2. Register the tool in `agents/agent-tools.js` — add to `toolRegistry` array
3. Add template entries in `agents/agent-executor.js` — `DESCRIPTION_TEMPLATES` and `ACTION_TEMPLATES`
4. Add to system prompt in `agents/agent-brain.js` — list under AVAILABLE TOOLS + examples
5. Install any new npm packages

### Tool Registry Format (agent-tools.js)
```javascript
{
  name: 'tool_name',
  description: 'What it does (shown to Groq)',
  params: {
    paramName: { type: 'string', required: true, description: 'What this param is' },
  },
  requiresConfirmation: true,
  async execute(params) {
    // Actual implementation
    return { success: true, message: 'Done!' };
  },
}
```

### IPC Flow
```
User types/says text
  → character.js: sendMessageToVishal()
    → IPC: agentParse(text)
      → main.js: agent-parse handler
        → agent-brain: parseIntent() → { action, params }
        → if "chat": askVishal() → return response
        → if tool: agent-executor: buildConfirmation() → return confirmation
    → character.js: showConfirmationBubble()
      → User clicks Yes
        → IPC: agentExecute(toolName, params)
          → main.js: agent-execute handler
            → agent-executor: executeConfirmed()
              → agent-tools: executeTool()
    → character.js: showChatBubble("✅ Done!")
```

---

## CRITICAL RULES

### Code Style
- **CommonJS** only — `require/module.exports`, NO ES modules (`import/export`)
- `@octokit/rest` MUST stay at v19.0.13 — never upgrade
- Log everything with `console.log` + emojis (e.g., `📧 Sending email`)
- Follow existing patterns in `agent-tools.js` when adding new tools

### Safety
- EVERY tool must set `requiresConfirmation: true`
- Never auto-execute — always wait for user to click Yes
- Handle errors gracefully: `{ success: false, error: "message" }`
- No destructive operations without explicit confirmation

### UI Conventions
- Use existing mood system: `setMood('thumbsUp', 2000)`
- Bubble: 300px wide, white bg, dark border, rounded
- Confirmation: green Yes button (`#27ae60`), red Cancel button (`#e74c3c`)
- Don't break existing features (voice, GitHub, chat, right-click, hotkeys)

---

## FUTURE FEATURES (ROADMAP)

### 1. ✅ WhatsApp Agent (Puppeteer) — DONE
- "Vishal, message mummy I'll be late"
- Uses Puppeteer + WhatsApp Web to send messages
- File: `agents/whatsapp-agent.js`
- Tool: `send_whatsapp(to, message)`

### 2. ✅ Instagram Agent (Puppeteer) — DONE
- "Vishal, check Instagram DMs"
- Uses Puppeteer + Instagram Web
- File: `agents/instagram-agent.js`
- Tool: `check_instagram_dms()`

### 3. Contact Book
- Map names to phone numbers/emails
- "Send to John" → look up John in contacts
- File: `agents/contacts.js`
- JSON-based storage in userData folder

### 4. Browser Automation Improvements
- Session persistence for WhatsApp/Instagram (keep logged in)
- QR code display in Vishal's bubble for first-time login
- Background monitoring for new messages

### 5. Calendar Agent
- Google Calendar integration
- "What's on my schedule today?"

### 6. System Controls
- "Vishal, shutdown in 30 minutes"
- "Mute system volume"
- Lock screen, sleep timer

### 7. Clipboard Agent
- "Copy this to clipboard"
- "Paste last thing I copied"
- "Save this note"

---

## QUICK TESTING CHECKLIST

After any change, verify:
1. Text input: Type command → confirmation bubble → Yes → executes
2. Voice input: Ctrl+Alt+Space → speak → confirmation → Yes → executes
3. Chat fallback: "how are you" → normal chat (no confirmation)
4. Cancel: Click Cancel → "👍 Cancelled, boss" → screen becomes clickable
5. Hotkeys: Ctrl+Alt+V (summon), Ctrl+Alt+G (GitHub), Ctrl+Alt+Space (voice)
6. Right-click menu still works
7. GitHub notifications don't break

---

## RESUME DEVELOPMENT

Continue building in priority order:
1. ✅ WhatsApp agent (Puppeteer) — DONE
2. ✅ Instagram agent (Puppeteer) — DONE
3. Contact book
4. Session management for web automation
5. Calendar agent
6. System controls
7. Clipboard agent

Tell the AI: "I'm resuming Pixel PM development. Build the next feature from the roadmap."
