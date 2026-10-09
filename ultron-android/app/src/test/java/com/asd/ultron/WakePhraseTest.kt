package com.asd.ultron

import org.junit.Assert.*
import org.junit.Test

class WakePhraseTest {
    @Test fun wakeWhileAsleep() {
        assertEquals(WakePhrase.Kind.WAKE, WakePhrase.parse("Ultron, wake up!", false).kind)
        assertEquals(WakePhrase.Kind.WAKE, WakePhrase.parse("Hey Ultron", false).kind)
        assertEquals(WakePhrase.Kind.WAKE, WakePhrase.parse("wake up ultron", false).kind)
        assertEquals(WakePhrase.Kind.EMPTY, WakePhrase.parse("What time is it?", false).kind)
    }
    @Test fun commandsAndNap() {
        assertEquals("what time is it", WakePhrase.parse("Ultron what time is it", true).command)
        assertEquals(WakePhrase.Kind.NAP, WakePhrase.parse("Ultron take a nap", true).kind)
        assertEquals(WakePhrase.Kind.STOP, WakePhrase.parse("Ultron end session", true).kind)
    }
}
