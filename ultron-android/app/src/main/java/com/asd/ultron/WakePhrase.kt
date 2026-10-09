package com.asd.ultron

/** Converts offline ASR transcripts into voice states. No network for wake detection. */
object WakePhrase {
    enum class Kind { WAKE, NAP, STOP, COMMAND, EMPTY }
    data class Parsed(val kind: Kind, val command: String = "")
    private val wake = Regex("\\b(?:hey\\s+ultron|hello\\s+ultron|ultron\\s+wake\\s+up|wake\\s+up\\s+ultron)\\b")
    private val nap = Regex("^(?:ultron\\s+)?(?:take\\s+a\\s+nap|go\\s+to\\s+sleep|go\\s+dormant|sleep|stand\\s*by|good\\s*night)\\b")
    private val stop = Regex("^(?:ultron\\s+)?(?:end\\s+session|stop\\s+listening|turn\\s+off\\s+(?:the\\s+)?microphone|shutdown|shut\\s+down)\\b")
    fun parse(transcript: String, awake: Boolean): Parsed {
        val normalized = transcript.lowercase().replace(Regex("[^a-z0-9\\s]"), " ")
            .replace(Regex("\\s+"), " ").trim()
        if (normalized.isEmpty()) return Parsed(Kind.EMPTY)
        if (!awake) {
            val hit = wake.find(normalized) ?: return Parsed(Kind.EMPTY)
            return Parsed(Kind.WAKE, normalized.substring(hit.range.last + 1).trim())
        }
        if (stop.containsMatchIn(normalized)) return Parsed(Kind.STOP)
        if (nap.containsMatchIn(normalized)) return Parsed(Kind.NAP)
        return Parsed(Kind.COMMAND, normalized.removePrefix("ultron ").trim())
    }
}
