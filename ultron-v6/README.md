# ULTRON V6 — Voice-Only AI

This prototype runs on a HTTPS Render Web Service using Node.js built-in modules. There is **no text-chat interface**. The microphone and browser speech recognition handle voice input; the browser's speech synthesis speaks responses. Wake words: **Hey Ultron** and **Ultron, wake up**. Nap words: **Ultron, take a nap** and **Ultron, go to sleep**. When napping, it keeps looking for the wake phrase only while Chrome is visible and the screen remains active.

## Deployment (Render)

Service: `ultron-intelligence-v6` (free-tier deployment). Start command: `node ultron-v6/server.js`. The Render live URL is `https://ultron-intelligence-v6.onrender.com`.

Open the Render dashboard → service → Environment. Add these **server-side only** variables:

- `OPENAI_API_KEY`: a valid API key from your own API account. Never share it in chat or commit it to GitHub.
- `ULTRON_ACCESS_CODE`: a long, randomly generated secret, ideally 16+ characters, for owner pairing.
- Optional `ULTRON_MODEL`: defaults to `gpt-4.1-mini`.

Render redeploys when the environment changes. Open the HTTPS website; expand **OWNER AI CONNECTION**, enter your access code once, and press **CONNECT ULTRON BRAIN**. The browser uses a Secure, HttpOnly, SameSite cookie. Spoken conversation text is forwarded to the configured model only while signed in. Browser demo memories use localStorage and are not a server database.

## Important boundaries

- The AI will **not** be live until the server variables are configured and owner pairing succeeds. The HTTPS page and /api/health work independently.
- Android Chrome cannot reliably listen when the phone is locked, the browser is backgrounded, or browser speech recognition is unavailable. A native Android service will be needed for more persistent wake word detection (subject to Android microphone rules).
- Once you give Chrome permission and tap **ENABLE MICROPHONE**, the website can re-arm recognition while the tab stays visible, subject to browser service limitations. No webpage can force Android microphone permission.
- This is a voice assistant prototype; there is no camera, robot control, or remote device access. AI requests can incur separate API costs. A public internet endpoint is protected by access code and request limits, but do not configure keys until you trust the deployment.
- Current conversation context is transient and limited to recent turns; there is no server-side persistent memory. Locally stored demo facts are not model context.

## Basic test checklist

1. Open the live HTTPS URL in Android Chrome.
2. In Chrome permissions, allow Microphone for the site; verify system-wide microphone access is enabled.
3. Press **ENABLE MICROPHONE**; verify Chrome recognizes speech.
4. Say **Ultron, wake up**. Listen for a spoken reply.
5. Say **Ultron, take a nap**, then **Ultron, wake up** again.
6. Open **OWNER AI CONNECTION** to check whether real AI is configured.
