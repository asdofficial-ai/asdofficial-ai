package com.asd.ultron

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Server side keys only. Auth uses a short-lived owner cookie in memory. */
class UltronApi {
    private val base = "https://ultron-intelligence-v6.onrender.com"
    private var cookie: String? = null
    private val history = ArrayDeque<Pair<String,String>>()
    val connected: Boolean get() = cookie != null

    fun connect(ownerCode: String): Result<Unit> = runCatching {
        require(ownerCode.isNotBlank()) { "Enter your private owner code." }
        val res = post("/api/unlock", JSONObject().put("code", ownerCode), false)
        if (res.status != 200) error(res.body.optString("error","Owner code rejected."))
        val raw = res.setCookie ?: error("Missing session from server.")
        cookie = raw.substringBefore(';').takeIf { it.startsWith("ultron_session=") }
            ?: error("Invalid session.")
        synchronized(history) { history.clear() }
    }
    fun ask(spoken: String): Result<String> = runCatching {
        check(connected) { "Pair your ULTRON brain first." }
        val last = JSONArray()
        synchronized(history) { history.forEach { (role,text) ->
            last.put(JSONObject().put("role",role).put("content",text))
        }}
        val res = post("/api/chat", JSONObject().put("message",spoken).put("history",last))
        if (res.status == 401) { cookie = null;error("Owner session expired. Re-pair ULTRON.") }
        if (res.status != 200) error(res.body.optString("error", "AI network unavailable."))
        val reply = res.body.optString("reply").trim()
        check(reply.isNotEmpty()) { "The AI produced no response." }
        synchronized(history) {
            history.addLast("user" to spoken)
            history.addLast("assistant" to reply)
            while(history.size > 12) history.removeFirst()
        }
        reply
    }
    private data class Response(val status: Int,val body: JSONObject,val setCookie: String?)
    private fun post(path: String, payload: JSONObject, useCookie: Boolean = true): Response {
        val url = URL(base + path).openConnection() as HttpURLConnection
        try {
            url.requestMethod = "POST"
            url.connectTimeout = 10000
            url.readTimeout = 30000
            url.doOutput = true
            url.setRequestProperty("Origin",base)
            url.setRequestProperty("Content-Type","application/json; charset=utf-8")
            if(useCookie) cookie?.let { url.setRequestProperty("Cookie",it) }
            url.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            val status = url.responseCode
            val stream = if(status in 200..299) url.inputStream else url.errorStream
            val json = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: "{}"
            return Response(status, JSONObject(json), url.getHeaderField("Set-Cookie"))
        } finally { url.disconnect() }
    }
}
