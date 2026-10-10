package com.asd.ultron

import android.Manifest
import android.app.Activity
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.widget.*
import java.text.DateFormat
import java.util.Date

/** No text messaging: only microphone activation and optional owner access code. */
class MainActivity : Activity() {
    private val bg = Color.rgb(8,9,12)
    private val panel = Color.rgb(25,18,23)
    private val red = Color.rgb(235,61,76)
    private val silver = Color.rgb(182,168,173)
    private lateinit var state: TextView
    private lateinit var detail: TextView
    private lateinit var wakeCheck: TextView
    private lateinit var heardCheck: TextView
    private lateinit var asrEvents: TextView
    private lateinit var access: EditText
    private val permissionCode = 1822
    private var isListening = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            state.text = intent?.getStringExtra(VoiceService.EXTRA_STATE) ?: "READY"
            detail.text = intent?.getStringExtra(VoiceService.EXTRA_DETAIL) ?: ""
            val decoded = intent?.getStringExtra(VoiceService.EXTRA_HEARD)
            if (decoded != null && ::heardCheck.isInitialized) {
                heardCheck.text = "HEARD: $decoded"
            }
            if (::asrEvents.isInitialized) {
                val count = intent?.getIntExtra(VoiceService.EXTRA_ASR_COUNT, 0) ?: 0
                asrEvents.text = "RECOGNITION UPDATES: $count"
            }
            isListening = !state.text.toString().contains("OFF") &&
                !state.text.toString().contains("BLOCKED") &&
                !state.text.toString().contains("DENIED")
            refreshWakeCheck()
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = bg
        window.navigationBarColor = bg
        val scroll = ScrollView(this).apply { setBackgroundColor(bg);isFillViewport=true }
        val root = LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL
            setPadding(dp(24),dp(36),dp(24),dp(32))
            gravity=Gravity.CENTER_HORIZONTAL
        }
        scroll.addView(root)
        setContentView(scroll)

        add(root, label("U   ◉", 79f, red, true), 220, 14)
        add(root, label("ULTRON  /  ANDROID", 24f, Color.WHITE, true), -2, 10)
        add(root, label("OFFLINE WAKE ENGINE  ·  V0.2.3", 12f, red, true), -2, 7)
        state = label("MICROPHONE OFF", 16f, Color.WHITE, true)
        add(root,state,-2,32)
        detail = label("Enable microphone once; test your wake word with the screen locked.",13f,silver,false)
        add(root,detail,-2,10)
        wakeCheck = label("LOCK TEST: NO WAKE DETECTED YET", 12f, red, true)
        add(root,wakeCheck,-2,15)
        heardCheck=label("HEARD: Nothing recognized yet", 13f, Color.WHITE, false)
        add(root,heardCheck,-2,10)
        asrEvents=label("RECOGNITION UPDATES: 0", 11f, silver, false)
        add(root,asrEvents,-2,8)
        add(root,label("If HEARD never changes while you speak, the voice recognizer has not decoded your voice. Try normal volume close to the phone. No shouting needed.",11f,silver,false),-2,9)
        add(root,button("🎙  ENABLE OFFLINE WAKE", red) { startMicrophone() },58,26)
        add(root,button("🔊  TEST ULTRON VOICE", Color.rgb(70,36,47)) {
            try { startService(Intent(this, VoiceService::class.java).setAction(VoiceService.TEST_VOICE)) }
            catch (_:Exception) { detail.text = "Start microphone before testing voice." }
        },49,10)
        add(root,button("■  STOP MICROPHONE", Color.rgb(75,28,38)) {
            stopService(Intent(this,VoiceService::class.java))
            state.text="MICROPHONE OFF"
            detail.text="Wake monitoring has stopped."
            isListening=false
        },52,10)
        add(root,label("SAY HEY ULTRON, ULTRON WAKE UP, OR I AM BACK",12f, Color.rgb(253,191,201),true),-2,23)
        add(root,label("Tap ENABLE OFFLINE WAKE once. ULTRON keeps listening during nap mode, even while locked if Android allows it. Say Take a nap to sleep; say I am back to wake. The microphone pauses briefly while ULTRON speaks to avoid feedback. Press STOP MIC to turn it off.",12f,silver,false),-2,12)

        add(root,label("SECURE AI OWNER PAIRING",13f,Color.WHITE,true),-2,25)
        add(root,label("Only needed for intelligent replies. The backend must have its API key and owner access code configured. This is not a text chat.",12f,silver,false),-2,10)
        access=EditText(this).apply{
            hint="Owner access code (not API key)"
            setSingleLine(true)
            setTextColor(Color.WHITE)
            setHintTextColor(silver)
            inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setPadding(dp(14),0,dp(14),0)
            background=GradientDrawable().apply {
                setColor(panel);setStroke(dp(1),red);cornerRadius=dp(6).toFloat()
            }
        }
        add(root,access,52,7)
        add(root,button("CONNECT TO ULTRON AI",Color.rgb(112,31,47)) {
            val code=access.text.toString();access.text.clear()
            if(code.isBlank()) {
                Toast.makeText(this,"Enter your owner access code.",Toast.LENGTH_LONG).show()
            } else {
                val intent=Intent(this,VoiceService::class.java).setAction(VoiceService.CONNECT)
                    .putExtra(VoiceService.EXTRA_CODE,code)
                startService(intent)
                detail.text="Checking your protected AI connection..."
            }
        },51,12)
        add(root,button("⚙  PHONE BATTERY SETTINGS",Color.rgb(45,37,43)) {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:$packageName")))
        },50,20)
        add(root,label("IMPORTANT: Start ULTRON while this app is visible. A foreground microphone notification remains active when locked. Android may still suspend it to save battery. This build does not automatically start recording after reboot. The offline model occupies significant storage and first launch takes time. Turn off battery optimization for ULTRON manually if your phone keeps stopping the service.",11f,silver,false),-2,20)
    }
    private fun refreshWakeCheck() {
        if (!::wakeCheck.isInitialized) return
        val prefs = getSharedPreferences("wake_diagnostics", MODE_PRIVATE)
        val count = prefs.getInt("count", 0)
        val last = prefs.getLong("last_wake_ms", 0L)
        wakeCheck.text = if (count == 0 || last == 0L) "LOCK TEST: NO WAKE DETECTED YET"
            else "WAKE DETECTED: $count TIMES · LAST " +
                DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(last))
    }
    private fun dp(px:Int)=(resources.displayMetrics.density*px).toInt()
    private fun label(value:String,size:Float,color:Int,bold:Boolean): TextView = TextView(this).apply{
        text=value;textSize=size;setTextColor(color);gravity=Gravity.CENTER
        if(bold)typeface=Typeface.DEFAULT_BOLD
    }
    private fun button(title:String,color:Int,action:()->Unit):Button=Button(this).apply{
        text=title;textSize=13f;isAllCaps=false;setTextColor(Color.WHITE)
        background=GradientDrawable().apply{setColor(color);cornerRadius=dp(7).toFloat()}
        setOnClickListener { action() }
    }
    private fun add(parent:LinearLayout,view:android.view.View,height:Int,top:Int){
        parent.addView(view, LinearLayout.LayoutParams(-1,if(height<0)height else dp(height)).apply {
            topMargin=dp(top)
        })
    }
    override fun onStart() {
        super.onStart()
        val filter=IntentFilter(VoiceService.EVENT)
        if(Build.VERSION.SDK_INT>=33) registerReceiver(receiver,filter,RECEIVER_NOT_EXPORTED)
        else @Suppress("DEPRECATION") registerReceiver(receiver,filter)
        refreshWakeCheck()
        // Query the running service. A recreated Activity must not incorrectly claim the microphone is off.
        try { startService(Intent(this, VoiceService::class.java).setAction(VoiceService.STATUS)) }
        catch (_: Exception) { /* The status controls remain usable if the OS blocks this request. */ }
    }
    override fun onStop() {
        try { unregisterReceiver(receiver) } catch (_:Exception) {}
        super.onStop()
    }
    private fun startMicrophone() {
        val needed=mutableListOf(Manifest.permission.RECORD_AUDIO)
        if(Build.VERSION.SDK_INT>=33) needed.add(Manifest.permission.POST_NOTIFICATIONS)
        val missing=needed.filter { checkSelfPermission(it)!=PackageManager.PERMISSION_GRANTED }
        if(missing.isNotEmpty()){requestPermissions(missing.toTypedArray(),permissionCode);return}
        actuallyStart()
    }
    private fun actuallyStart() {
        try {
            startForegroundService(Intent(this,VoiceService::class.java).setAction(VoiceService.START))
            isListening=true
            state.text="STARTING"
            detail.text="Loading microphone and local speech model..."
        }catch(e:Exception) {
            state.text="SERVICE BLOCKED"
            detail.text="Open ULTRON and allow microphone permission to start it."
        }
    }
    override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray) {
        super.onRequestPermissionsResult(requestCode,permissions,grantResults)
        if(requestCode==permissionCode) {
            if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)
                actuallyStart()
            else {
                state.text="PERMISSION DENIED"
                detail.text="Allow microphone access in Android settings."
            }
        }
    }
}
