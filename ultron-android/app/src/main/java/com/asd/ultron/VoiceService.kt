package com.asd.ultron

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.*
import android.speech.tts.*
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.SpeechService
import org.vosk.android.RecognitionListener
import java.io.File
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/** Offline Vosk listener in a visible user-started microphone foreground service. */
class VoiceService : Service(), RecognitionListener {
    companion object {
        const val START = "com.asd.ultron.START"
        const val STOP = "com.asd.ultron.STOP"
        const val CONNECT = "com.asd.ultron.CONNECT"
        const val STATUS = "com.asd.ultron.STATUS"
        const val EVENT = "com.asd.ultron.STATE"
        const val EXTRA_CODE = "owner_code"
        const val EXTRA_STATE = "state"
        const val EXTRA_DETAIL = "detail"
        private const val CHANNEL = "ultron_foreground_offline"
        private const val NOTIFY_ID = 711
        private const val NAP_MS = 150000L
    }

    private val handler = Handler(Looper.getMainLooper())
    private val background = Executors.newSingleThreadExecutor()
    private val api = UltronApi()
    private var model: Model? = null
    private var recognizer: Recognizer? = null
    private var speech: SpeechService? = null
    private var tts: TextToSpeech? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var ttsReady = false
    private var running = false
    private var awake = false
    private var busy = false
    private var speaking = false
    private var ready = false
    private var lastCommand = 0L
    private var retry = 0
    private var latestState = "MICROPHONE OFF"
    private var latestDetail = "Start ULTRON to enable offline wake monitoring."

    private val watchdog = object : Runnable {
        override fun run() {
            if (!running) return
            if (awake && !busy && !speaking && SystemClock.elapsedRealtime() - lastCommand > NAP_MS) {
                awake = false
                status("NAP MODE", "Listening for wake phrase, including when locked if Android allows.")
            }
            handler.postDelayed(this, 15000L)
        }
    }
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val channel = NotificationChannel(CHANNEL, "ULTRON offline microphone", NotificationManager.IMPORTANCE_LOW)
        channel.description = "Visible microphone notification while ULTRON monitors wake phrases."
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        tts = TextToSpeech(this) { result ->
            ttsReady = result == TextToSpeech.SUCCESS
            if (ttsReady) {
                tts?.language = Locale.US
                val male = tts?.voices?.firstOrNull { it.locale.language == "en" &&
                    (it.name.contains("male", true) || it.name.contains("david", true)) }
                if (male != null) tts?.voice = male
            }
        }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            STOP -> { stopSelf(); return START_NOT_STICKY }
            STATUS -> {
                status(if (running) latestState else "MICROPHONE OFF",
                    if (running) latestDetail else "Wake monitoring is not running.")
                if (!running) stopSelf()
                return START_NOT_STICKY
            }
            CONNECT -> {
                if (running) {
                    val code = intent.getStringExtra(EXTRA_CODE).orEmpty()
                    background.execute {
                        val result = api.connect(code)
                        handler.post {
                            if (!running) return@post
                            result.fold(
                                { status("AI CONNECTED", "Real AI is paired to ULTRON.") },
                                { status("PAIRING FAILED", it.message ?: "Check private owner code.") }
                            )
                        }
                    }
                } else {
                    status("MICROPHONE OFF", "Enable offline wake before owner pairing.")
                    stopSelf()
                }
                return START_NOT_STICKY
            }
            START -> if (!running) startSession()
        }
        return START_NOT_STICKY
    }

    private fun startSession() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            status("MICROPHONE DENIED", "Grant microphone permission from app.")
            stopSelf();return
        }
        try {
            startForeground(NOTIFY_ID, notification("Preparing offline voice model"),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } catch (e: Exception) {
            status("SERVICE BLOCKED", "Android refused microphone foreground service.")
            stopSelf();return
        }
        running = true
        lastCommand = SystemClock.elapsedRealtime()
        try {
            wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ULTRON:OfflineWake").apply { acquire() }
        } catch (_: Exception) {}
        handler.post(watchdog)
        status("PREPARING MODEL", "First launch unpacks offline model. Please wait.")
        background.execute {
            try {
                val home = File(filesDir, "vosk-en-us-small-015")
                if (!File(home, "am/final.mdl").exists()) {
                    val temp = File(filesDir, "vosk-en-us-small-015-temp")
                    temp.deleteRecursively()
                    copyAssets("vosk-en-us-small-015", temp)
                    check(File(temp, "am/final.mdl").exists()) { "Offline model missing." }
                    home.deleteRecursively()
                    check(temp.renameTo(home)) { "Could not install offline model." }
                }
                val loaded = Model(home.absolutePath)
                handler.post {
                    if (!running) { loaded.close();return@post }
                    model = loaded;ready = true
                    status("NAP MODE", "Offline wake detector ready; lock your phone to test.")
                    listen()
                }
            } catch (e: Exception) {
                handler.post { status("MODEL ERROR", e.message ?: "Model could not load.");stopSelf() }
            }
        }
    }

    private fun copyAssets(source: String, dest: File) {
        val entries = assets.list(source) ?: emptyArray()
        if (entries.isEmpty()) {
            dest.parentFile?.mkdirs()
            assets.open(source).use { input -> dest.outputStream().use { input.copyTo(it, 65536) } }
        } else {
            dest.mkdirs()
            entries.forEach { copyAssets("$source/$it", File(dest,it)) }
        }
    }

    private fun listen() {
        if (!running || !ready || busy || speaking || speech != null) return
        try {
            recognizer = Recognizer(model ?: return, 16000f)
            speech = SpeechService(recognizer, 16000f)
            speech?.startListening(this)
            retry = 0
            status(if (awake) "LISTENING" else "NAP MODE",
                if (awake) "Speak your request." else "Say Hey Ultron or Ultron wake up.")
        } catch (e: Exception) {
            stopRecognition()
            retry++
            status("MICROPHONE ERROR", e.message ?: "Microphone unavailable.")
            if (retry < 6) handler.postDelayed({ listen() }, 2000L * retry)
        }
    }
    private fun stopRecognition() {
        val old = speech;speech = null
        try { old?.cancel() } catch (_: Exception) {}
        try { old?.shutdown() } catch (_: Exception) {}
        try { recognizer?.close() } catch (_: Exception) {}
        recognizer = null
    }

    override fun onPartialResult(hypothesis: String?) {
        if (!running || awake || busy || speaking) return
        val spoken = runCatching { JSONObject(hypothesis ?: "{}").optString("partial") }.getOrDefault("")
        if (WakePhrase.parse(spoken, false).kind == WakePhrase.Kind.WAKE) receive(spoken)
    }
    override fun onResult(hypothesis: String?) {
        if (!running || busy || speaking) return
        val spoken = runCatching { JSONObject(hypothesis ?: "{}").optString("text") }.getOrDefault("")
        if (spoken.isNotBlank()) receive(spoken)
    }
    override fun onFinalResult(hypothesis: String?) {
        if (!running || busy || speaking) return
        val spoken = runCatching { JSONObject(hypothesis ?: "{}").optString("text") }.getOrDefault("")
        if (spoken.isNotBlank()) receive(spoken)
    }
    override fun onError(exception: Exception?) {
        if (!running) return
        status("LISTENING ERROR", exception?.message ?: "Offline recognition failed.")
        stopRecognition()
        handler.postDelayed({ listen() }, 2200L)
    }
    override fun onTimeout() {
        if (!running) return
        stopRecognition()
        handler.postDelayed({ listen() }, 700L)
    }
    private fun receive(spoken: String) {
        if (!running || busy || speaking) return
        val parsed = WakePhrase.parse(spoken, awake)
        when (parsed.kind) {
            WakePhrase.Kind.EMPTY -> return
            WakePhrase.Kind.WAKE -> {
                awake = true;lastCommand = SystemClock.elapsedRealtime()
                noteWakeDetection()
                if (parsed.command.isBlank()) speak("I am online, sir. How may I assist you?")
                else command(parsed.command)
            }
            WakePhrase.Kind.NAP -> { awake = false;speak("Entering nap mode. Call me when needed.") }
            WakePhrase.Kind.STOP -> speak("Disabling microphone.", true)
            WakePhrase.Kind.COMMAND -> {
                lastCommand = SystemClock.elapsedRealtime()
                if (parsed.command.isNotBlank()) command(parsed.command)
            }
        }
    }
    /** Stores only wake event time/count, never transcripts or raw microphone audio. */
    private fun noteWakeDetection() {
        val prefs = getSharedPreferences("wake_diagnostics", MODE_PRIVATE)
        val count = prefs.getInt("count", 0)
        prefs.edit().putInt("count", if (count < Int.MAX_VALUE) count + 1 else count)
            .putLong("last_wake_ms", System.currentTimeMillis()).apply()
    }
    private fun command(q: String) {
        val text = q.lowercase(Locale.US)
        when {
            text.contains("what time") || text == "time" ->
                speak("The time is " + DateFormat.getTimeInstance(DateFormat.SHORT).format(Date()) + ".")
            text.contains("what date") || text == "date" ->
                speak("Today is " + DateFormat.getDateInstance(DateFormat.FULL).format(Date()) + ".")
            text.contains("status") ->
                speak("My offline wake detection is active. Real AI is " +
                    (if (api.connected) "connected." else "awaiting owner pairing."))
            !api.connected ->
                speak("My wake detector is online, but real intelligence needs secure owner pairing.")
            else -> {
                busy = true;stopRecognition()
                status("THINKING", "Asking ULTRON intelligence.")
                background.execute {
                    val response = api.ask(q)
                    handler.post {
                        if (!running) return@post
                        busy = false
                        response.fold(
                            { speak(it) },
                            { speak("I cannot reach my intelligence. Check the server and try again.") }
                        )
                    }
                }
            }
        }
    }
    private fun speak(text: String, stopAfter: Boolean = false) {
        if (!running) return
        speaking = true;stopRecognition()
        status("SPEAKING", "ULTRON voice response.")
        if (!ttsReady) { speaking = false;if (stopAfter) stopSelf() else handler.postDelayed({ listen() }, 750L);return }
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) { handler.post { afterSpeech(stopAfter) } }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) { handler.post { afterSpeech(stopAfter) } }
        })
        val id = "ultron-" + SystemClock.elapsedRealtime()
        if (tts?.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), id) != TextToSpeech.SUCCESS)
            afterSpeech(stopAfter)
    }
    private fun afterSpeech(stopAfter: Boolean) {
        if (!running || !speaking) return
        speaking = false
        if (stopAfter) stopSelf() else handler.postDelayed({ listen() }, 450L)
    }
    private fun notification(detail: String): Notification {
        val open = PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 2, Intent(this, VoiceService::class.java).setAction(STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL)
            .setContentTitle("ULTRON — microphone active")
            .setContentText(detail).setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(android.R.drawable.ic_media_pause, "STOP", stop).build())
            .setOngoing(true).setCategory(Notification.CATEGORY_SERVICE).build()
    }
    private fun status(state: String, detail: String) {
        latestState = state
        latestDetail = detail
        sendBroadcast(Intent(EVENT).setPackage(packageName)
            .putExtra(EXTRA_STATE, state).putExtra(EXTRA_DETAIL, detail))
        if (running) try {
            getSystemService(NotificationManager::class.java).notify(NOTIFY_ID, notification(state + ": " + detail))
        } catch (_: Exception) {}
    }
    override fun onDestroy() {
        running = false
        handler.removeCallbacks(watchdog)
        stopRecognition()
        try { model?.close() } catch (_: Exception) {}
        model = null
        try { wakeLock?.let { if (it.isHeld) it.release() } } catch (_: Exception) {}
        tts?.stop();tts?.shutdown();tts = null
        background.shutdownNow()
        status("MICROPHONE OFF", "Stopped. Open app to re-enable.")
        super.onDestroy()
    }
}
