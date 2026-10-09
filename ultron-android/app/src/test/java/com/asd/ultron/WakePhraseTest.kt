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

    @Test fun lockWakeRecognitionHandlesPunctuationAndExtraCommand() {
        val phrase = WakePhrase.parse("Hey, Ultron! What's the time?", false)
        assertEquals(WakePhrase.Kind.WAKE, phrase.kind)
        assertEquals("what s the time", phrase.command)
        assertEquals(WakePhrase.Kind.WAKE, WakePhrase.parse("Hello Ultron", false).kind)
    }
    @Test fun dormantModeMustIgnoreOrdinarySpeech() {
        assertEquals(WakePhrase.Kind.EMPTY, WakePhrase.parse("Can you help me", false).kind)
        assertEquals(WakePhrase.Kind.EMPTY, WakePhrase.parse("Goodnight my friend", false).kind)
        assertEquals(WakePhrase.Kind.EMPTY, WakePhrase.parse("What time is it Ultron", false).kind)
    }
    @Test fun sleepAndShutdownRemainAvailableAfterWake() {
        assertEquals(WakePhrase.Kind.NAP, WakePhrase.parse("Ultron go dormant", true).kind)
        assertEquals(WakePhrase.Kind.NAP, WakePhrase.parse("Ultron stand by", true).kind)
        assertEquals(WakePhrase.Kind.STOP, WakePhrase.parse("Ultron stop listening", true).kind)
    }
}
