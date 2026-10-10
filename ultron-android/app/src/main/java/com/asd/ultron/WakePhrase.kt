package com.asd.ultron

/**
 * Voice only. The offline recognizer often transcribes the uncommon name
 * "Ultron" as "old tron", "all tron", or "ultra". Accept conservative
 * phonetic variations after a clear wake opener.
 */
object WakePhrase {
    enum class Kind { WAKE, NAP, STOP, COMMAND, EMPTY }
    data class Parsed(val kind: Kind, val command: String = "")

    private val name = "(?:ultron|ultra|ul tron|old tron|all tron|old drawn|all drawn)"
    private val wake = Regex(
        "\\b(?:hey\\s+$name|hello\\s+$name|$name\\s+wake\\s+up|wake\\s+up\\s+$name|i\\s+am\\s+back|i\\s+m\\s+back|im\\s+back)\\b"
    )
    private val nap = Regex(
        "^(?:$name\\s+)?(?:take\\s+a\\s+nap|take\\s+nap|go\\s+to\\s+sleep|go\\s+dormant|sleep|stand\\s*by|good\\s*night)\\b"
    )
    private val stop = Regex(
        "^(?:$name\\s+)?(?:end\\s+session|stop\\s+listening|turn\\s+off\\s+(?:the\\s+)?microphone|shutdown|shut\\s+down)\\b"
    )
    fun parse(transcript: String, awake: Boolean): Parsed {
        val normalized = transcript.lowercase()
            .replace(Regex("[^a-z0-9\\s]"), " ")
            .replace(Regex("\\s+"), " ").trim()
        if (normalized.isEmpty()) return Parsed(Kind.EMPTY)
        if (!awake) {
            val hit = wake.find(normalized) ?: return Parsed(Kind.EMPTY)
            return Parsed(Kind.WAKE, normalized.substring(hit.range.last + 1).trim())
        }
        if (stop.containsMatchIn(normalized)) return Parsed(Kind.STOP)
        if (nap.containsMatchIn(normalized)) return Parsed(Kind.NAP)
        return Parsed(Kind.COMMAND, normalized.replace(Regex("^$name\\s+"), "").trim())
    }
}
