# Kane personal AI cockpit

Requires Node.js 24 or newer. Run `npm install`, then `npm start` from this project folder. Open http://127.0.0.1:3001 in Chrome. To restart after configuration changes, press Ctrl+C in the server terminal and run `npm start` again.

Your private backend configuration is `.env` in the project root. Never upload it. `.env.example` is the tracked placeholder template; copy it only if `.env` does not already exist. Blank values and PASTE_ placeholders count as unconfigured.

Paste Groq credentials into `AI_API_KEY` with `AI_PROVIDER=groq` and `AI_MODEL=openai/gpt-oss-20b`. Leave `AI_BASE_URL` empty for the official endpoint. For recognition, paste a Groq key into `STT_API_KEY` with `STT_PROVIDER=groq` and `STT_MODEL=whisper-large-v3-turbo`. A shared key can be configured separately for both capabilities. Paste your Fish key into `TTS_API_KEY`, use `TTS_PROVIDER=fish`, `TTS_MODEL=s2.1-pro-free`, and put your chosen voice identifier in `TTS_VOICE_ID`. For internet research, set `SEARCH_PROVIDER=groq` and paste a Groq key into `SEARCH_API_KEY`. Search remains disabled until configured. No credentials belong in frontend code.

Implemented features:

- Black and gold cockpit inspired by the reference, with actual backend telemetry and decorative orbital graphics.
- Streamed conversations, cancellation, persistent sessions, explicit memories, notes and tasks.
- Microphone recording with silence detection, Groq transcription and Fish playback. Opt-in browser wake phrases: Hey Kane and Hey K. Listening pauses while recording, transcribing or playing replies. Stop disables it; leaving the page stops listening. Chrome recognition may use its speech service.
- Groq browser search with source links from provider metadata.
- Forex daily reference rates from Frankfurter/ECB, five-day statistical baseline intervals, and walk-forward error/coverage metrics. These are experimental scenarios, not guaranteed predictions or executable trading prices. No trades are placed.
- Android pairing, revocation, exact-action approval and a second phone tap. Actions open HTTPS links, a dialer or an SMS draft. You complete calls and send messages yourself. No lock bypass, camera/files access or background phone control.
- Calculator/time tools and browser installation support where available. AI features require connectivity.

The default server binds to this computer only. An Android handset cannot reach this computer's loopback URL. Actual handset pairing requires a reachable authenticated HTTPS instance. Public hosting is deferred while Kane remains local; no paid service has been created. The companion route is `/phone`.

Public hosting requires `APP_PASSWORD` of at least 16 characters, an HTTPS `PUBLIC_ORIGIN`, and persistent `DATABASE_PATH`. See `config/hosting.example`. Optional private `.env.hosting` is supported and ignored by Git. The Dockerfile prepares a Node 24 service. Do not expose the default unauthenticated loopback app through a tunnel.

Startup reports capabilities without credentials. Configured availability does not prove live connectivity. Node uses `--use-system-ca` while retaining TLS verification. Local history is plaintext in ignored `data/kane.sqlite`; back it up with the server stopped. Behavior is in `config/behavior.txt`; limits and voice speed are in `config/runtime.json`.

Run `npm run typecheck` and `npm test`. Live checks: `node --use-system-ca scripts/check-providers.mjs` and `node --use-system-ca scripts/check-extensions.mjs`. These make short billable API requests. `node scripts/smoke.mjs` checks a running server and removes its test records. Tests use fake credentials.

Verified: live text/streaming, Fish audio, transcription of generated audio, research source metadata, Forex data, persistence and automated checks. Physical microphone/speaker behavior, Android handset actions and PWA installation require device testing. History summarization, model-directed external actions, autonomous scheduling is not implemented. Persistent reminders and open-tab notifications are implemented.

Reminders: use the VOICE & REMINDERS panel, choose a local date/time and save. Dates are stored in UTC. One-time reminders, every-24-hour/every-7-day repetition, snooze, dismissal and a 25-minute focus timer are supported. Repeating reminders use fixed elapsed hours, so the local clock time can shift at daylight-saving changes. Click Enable reminder notifications to grant permission. Kane's server and an open browser tab are required; closed/suspended browsers cannot receive scheduled notifications. Overdue reminders remain in the cockpit after reopening. Wake listening resets off on reload. Browser recognition support and actual microphone/notification delivery require device testing. See https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition and https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification .
