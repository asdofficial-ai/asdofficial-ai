# ULTRON Android 0.2 Alpha — Offline Wake + APK

**Source:** `ultron-android` (Kotlin native app). **Build:** GitHub Actions `ULTRON Android APK` workflow. The workflow downloads and bundles the official [Vosk small English 0.15](https://alphacephei.com/vosk/models) offline speech recognition model and compiles a signed-by-Android-debug-tools installable APK. It never stores an API key or owner code in code.

## Improvements in 0.2.1-alpha

- The activity requests current service status when reopened, rather than assuming microphone monitoring stopped. This also allows owner pairing after returning from a locked screen.
- The app displays a cumulative wake-detection count and the last recognized wake timestamp. These are **local diagnostic events only**; it does not store the spoken words or audio.
- Added unit tests for nap, shutdown, and multiple wake-phrase variations.
- To test: enable offline wake while the app is visible, lock the phone, say **"Hey Ultron"**, unlock it, and compare the wake-detection count. Then try responding by voice and check whether the foreground microphone notification remained present.
- **APK update warning:** the GitHub runner signs debug builds with an ephemeral debug certificate. If Android reports a signing conflict when installing 0.2.1 over 0.2.0, uninstall the earlier experimental debug app before installing the new one. You may lose any local test configuration.
- Even if the wake counter increases with the screen locked, reliable operation still requires repeated tests on the actual device under battery restrictions and different noise conditions. No code-only test can prove 24/7 compatibility.

## How to install / test
1. Download the APK from the GitHub Actions run artifact or the generated **ULTRON Android 0.2 alpha** GitHub prerelease. This is a prototype debug APK; Android may warn about installing apps from outside Play Store. Install only if you trust the source. Back up before trying experimental software.
2. Open ULTRON with the screen unlocked and grant microphone permission, plus notifications when asked.
3. Tap **ENABLE OFFLINE WAKE**. Leave the app visible for the first launch to extract the model; watch the app status.
4. When it says **NAP MODE**, say **"Hey Ultron"** or **"Ultron, wake up"**, then give a voice command.
5. Press your power button to lock the phone and try the wake phrase again. There should be a persistent **ULTRON — microphone active** notification when the user-started service is running.
6. Say **"Ultron, take a nap"** to resume quiet wake monitoring, or **"Ultron, end session"** to stop recording. You can always tap STOP in the notification or app.
7. If the service stops after lock, open ULTRON app settings and manually adjust battery restrictions to **Unrestricted** where supported. Confirm global microphone access is on.

## Implementation
- **Wake engine:** Vosk offline small US English ASR model, bundled in assets at build time and extracted to app files on first launch. No streaming of wake audio to a remote speech server.
- **Screen lock:** A user-initiated Android foreground microphone service and partial CPU wake lock keep the audio listener running while Android permits. It does not need Chrome, nor does it depend on Android's intermittent `SpeechRecognizer`.
- **AI backend:** optional HTTPS connection to existing `https://ultron-intelligence-v6.onrender.com` using owner access code to obtain a short-lived cookie. API keys remain on server. Speech to AI is sent as text only **after wake and command**.
- **Voice interface:** speech and spoken responses, no text chat.
- **Security/privacy:** ongoing microphone disclosure, stop control, no boot auto-start, no background service restart when the OS kills it; no covert use. Code entry is for owner authentication only, not chat.

## Limitations
- **Locked-screen reliability is device dependent, not yet verified on the user's phone.** Android (especially Android 14+) may throttle, revoke, or kill foreground microphone services depending on vendor, battery state, microphone privacy settings and competing calls. This is an engineering prototype, not an unconditional always-on guarantee.
- Wake detection uses general offline ASR with phrase matching. It is not a custom trained low-power keyword spotting engine, and may miss variants ("ultron" misrecognized) or false trigger. Battery use may be substantial due to CPU partial wake lock and continuous offline ASR.
- Do not expect the microphone to re-arm automatically after reboot: on Android 14+, boot-started microphone foreground services are restricted. User must open the app and start listening again.
- Real AI requires configuring `OPENAI_API_KEY` and `ULTRON_ACCESS_CODE` on the Render backend. The application does not contain a key.
- The GitHub Actions build is compile/test validation only; microphone, screen-lock behavior, acoustics, echo feedback, and actual phone install need physical testing.

## Build manually
With Android SDK 35 and JDK 17:

```sh
# place official unzipped vosk-model-small-en-us-0.15 folder into
# app/src/main/assets/vosk-en-us-small-015/
gradle testDebugUnitTest assembleDebug
```

APK: `ultron-android/app/build/outputs/apk/debug/app-debug.apk`.
