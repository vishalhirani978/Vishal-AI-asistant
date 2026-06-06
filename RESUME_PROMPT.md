# Pixel PM — Master Resume Prompt

Paste this into any AI (Claude, ChatGPT, etc.) to resume work on Vishal, the pixel art AI project manager.

---

## PROJECT OVERVIEW

Vishal is an Electron desktop app — a pixel art character that lives on the user's screen as a transparent always-on-top overlay. He monitors GitHub, chats via AI, and executes actions (open URLs, send emails, etc.) through an agent system with user confirmation.

**OS:** Windows 10  
**Screen:** 1536x824  
**Project path:** C:\Users\Vishal\Downloads\VISHAL  
**Run command:** `npm run dev` (opens DevTools) or `npm start`

---

## TECH STACK

- **Electron** ^32.0.0 (Windows desktop)
- **groq-sdk** ^1.2.0 (primary AI — llama-3.3-70b-versatile)
- **@google/generative-ai** ^0.24.1 (fallback AI)
- **@octokit/rest** v19.0.13 (GitHub API — DO NOT UPGRADE, v20+ breaks CommonJS)
- **nodemailer** (Gmail SMTP for sending)
- **imap** (Gmail IMAP for reading inbox)
- **mailparser** (Parse raw IMAP email data)
- **puppeteer** ^25.1.0 (WhatsApp + Instagram web automation)
- **dotenv** ^17.4.2
- **electron-builder** ^24.x (for .exe)

---

## FILE STRUCTURE

```
C:\Users\Vishal\Downloads\VISHAL
├── main.js                    # Electron main process — window, IPC, hotkeys, app lifecycle
├── preload.js                 # IPC bridge — exposes vishalAPI to renderer
├── package.json
├── .env                       # GROQ_API_KEY, GEMINI_API_KEY, GITHUB_TOKEN, GMAIL_USER, GMAIL_APP_PASSWORD
├── RESUME_PROMPT.md           # ← YOU ARE HERE
│
├── agents/
│   ├── claude-brain.js        # Chat AI — Groq primary, Gemini fallback, conversation memory
│   ├── personality.js         # Vishal's personality system prompt
│   ├── agent-brain.js         # Intent parser — 23 tools with examples
│   ├── agent-tools.js         # Tool registry — 23 tools registered
│   ├── agent-executor.js      # Coordinator — confirmation templates for all tools
│   ├── gmail-agent.js         # Gmail: send (nodemailer) + read inbox (IMAP)
│   ├── whatsapp-agent.js      # WhatsApp: send messages + read inbox (Puppeteer)
│   ├── instagram-agent.js     # Instagram DM checker (Puppeteer)
│   ├── system-agent.js        # System controls: shutdown, restart, lock, sleep, volume
│   ├── contacts.js            # Contact book — JSON storage in userData
│   ├── whisper.js             # Voice transcription via Groq Whisper
│   ├── github-watcher.js      # GitHub polling (every 60s)
│   └── github-actions.js      # GitHub actions — approve PR, comment, open in browser
│
├── renderer/
│   ├── index.html             # Main overlay page
│   ├── style.css              # All styles
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

### Agent System
- ✅ Intent parser (`agent-brain.js`) — 23 tools with full examples
- ✅ Tool registry (`agent-tools.js`) — 23 tools registered
- ✅ Confirmation flow — always asks Yes/Cancel before executing
- ✅ Mood reactions: thinking → pointingRight → excited → thumbsUp

---

## ALL 23 REGISTERED TOOLS

| Tool | Description |
|------|-------------|
| `open_url(url, name?)` | Open any website |
| `google_search(query)` | Search Google |
| `open_youtube(search?)` | Open YouTube, optional search |
| `open_gmail()` | Open Gmail in browser |
| `send_email(to, subject, body)` | Send email via Gmail SMTP |
| `check_email_inbox()` | Unread count + recent senders via IMAP |
| `get_unread_emails()` | Detailed list of unread emails |
| `search_emails(query)` | Search Gmail by sender or subject |
| `open_whatsapp_web()` | Open WhatsApp Web |
| `send_whatsapp(to, message)` | Send WhatsApp via Puppeteer |
| `check_whatsapp_inbox()` | Unread chats + previews via Puppeteer |
| `check_instagram_dms()` | Check Instagram DMs |
| `add_contact(name, phone?, email?)` | Add/update contact |
| `list_contacts()` | Show all contacts |
| `remove_contact(name)` | Delete contact |
| `search_contact(query)` | Look up contact by name |
| `system_shutdown(minutes?)` | Shutdown PC (immediate or scheduled) |
| `system_restart(minutes?)` | Restart PC (immediate or scheduled) |
| `system_cancel_shutdown()` | Cancel scheduled shutdown/restart |
| `system_lock()` | Lock Windows screen |
| `system_sleep()` | Sleep/suspend mode |
| `system_volume(level)` | Set volume 0-100 |
| `system_mute()` | Toggle mute/unmute |

---

## ARCHITECTURE PATTERNS

### Adding a New Tool
1. Create the agent module in `agents/` (e.g., `agents/calendar-agent.js`)
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

## DEVELOPMENT PRIORITY ORDER (Updated)

1. ✅ WhatsApp agent (send) — DONE
2. ✅ Instagram agent (check DMs) — DONE
3. ✅ Contact book (add/list/remove/search) — DONE
4. ✅ Gmail Inbox Intelligence (IMAP read) — DONE
5. ✅ WhatsApp Inbox Intelligence (read unread) — DONE
6. ✅ System Controls (shutdown/restart/lock/sleep/volume/mute) — DONE
7. ⬜ Browser Automation Infrastructure (session persistence, QR onboarding UI)
8. ⬜ Calendar Agent (Google Calendar integration)
9. ⬜ Screen Awareness (screenshot + analysis)
10. ⬜ Clipboard & Notes Agent
11. ⬜ Character Evolution & Marketplace

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
8. "Who's in my contacts?" → lists all contacts
9. "Any unread emails?" → IMAP inbox check
10. "Lock my PC" → confirmation → locks screen
