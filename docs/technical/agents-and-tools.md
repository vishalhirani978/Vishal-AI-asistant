# Agent Tools & Execution Framework

All operations that Vishal can execute (browser automation, emails, calendar, system controls) are built as **Agent Tools**.

---

## 1. Tool Registry Structure (`agents/agent-tools.js`)

All tools must be registered in the `toolRegistry` array. Each tool is an object defined as follows:

```javascript
{
  name: 'tool_name',
  description: 'What the tool does, utilized by the LLM system prompt',
  params: {
    paramKey: { 
      type: 'string' | 'number' | 'boolean', 
      required: true, 
      description: 'Param details' 
    }
  },
  requiresConfirmation: true, // Forces the character confirmation flow
  async execute(params) {
    // Tool business logic goes here
    return { success: true, message: 'Tool completion message' };
  }
}
```

---

## 2. Confirmation & Execution Workflow

To ensure system safety, the application enforces a verification checkpoint:

1. **Intent Parsed**: The intent parser resolves a tool name (e.g. `system_shutdown`).
2. **Build Confirmation**: `agent-executor.js` queries `DESCRIPTION_TEMPLATES` and `ACTION_TEMPLATES` to construct a confirmation dialog.
3. **Prompt User**: The renderer displays the confirmation bubble with "Yes, do it" and "Cancel" buttons.
4. **Execution**:
   - If "Yes" is clicked, `agentExecute` IPC triggers `agent-tools.js:executeTool()`.
   - If "Cancel" is clicked, the operation aborts and Vishal walks back to his corner.

---

## 3. Puppeteer Browser Manager (`agents/browser-manager.js`)

To enable **browser reuse** and **session persistence**:
- We maintain a single browser reference: `let browserInstance = null;`.
- The `getBrowser(sessionType)` function checks if the active browser matches the requested session type (e.g. `whatsapp` vs `instagram`).
- If it does, we reuse the existing browser window or tab.
- If it differs, the manager closes the old browser and opens a new instance targeting the correct session folder (`app.getPath('userData')/whatsapp-session`).
- Reusing the browser instance significantly reduces overhead (launch time drops from ~8 seconds to under 1 second).

---

## 4. System & OS Controls (`agents/system-agent.js`)

Direct system actions use Windows shell utilities via Node's `child_process.exec`:
- **Lock screen**: `rundll32.exe user32.dll,LockWorkStation`
- **Sleep mode**: `rundll32.exe powrprof.dll,SetSuspendState 0,1,0`
- **Shutdown/Restart**: `shutdown /s /t <delay>` / `shutdown /r /t <delay>`
- **Volume**: Executed via custom PowerShell scripts wrapping the Windows Audio Core API to set/mute audio levels.
