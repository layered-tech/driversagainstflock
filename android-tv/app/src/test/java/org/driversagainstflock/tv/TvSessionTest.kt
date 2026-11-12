package org.driversagainstflock.tv

import org.junit.Assert.*
import org.junit.Test

class TvSessionTest {
    @Test fun pairingIsRequiredBeforeTheAreaHome() {
        val session = TvSession { 0L }
        session.restore(paired = true)
        assertEquals(TvScreen.Home, session.screen)
        assertFalse(session.back())
        session.restore(paired = false)
        assertEquals(TvScreen.Pairing, session.screen)
        session.completePairing()
        assertEquals(TvScreen.Home, session.screen)
        assertFalse(session.back())
        assertFalse(TvScreen.entries.any { it.name == "Explore" })
    }

    @Test fun backReturnsToTheActualOrigin() {
        val session = TvSession { 0L }
        session.restore(paired = true)
        session.navigate(TvScreen.Camera)
        session.navigate(TvScreen.Settings)
        assertTrue(session.back())
        assertEquals(TvScreen.Camera, session.screen)
        assertTrue(session.back())
        assertEquals(TvScreen.Home, session.screen)
    }

    @Test fun areasLandingAndFeedHaveIndependentBackDestinations() {
        val session = TvSession { 0L }
        session.restore(paired = true)
        session.navigate(TvScreen.Areas)
        session.navigate(TvScreen.AreaFeed)
        session.navigate(TvScreen.Camera)
        assertTrue(session.back())
        assertEquals(TvScreen.AreaFeed, session.screen)
        assertTrue(session.back())
        assertEquals(TvScreen.Areas, session.screen)
        assertTrue(session.back())
        assertEquals(TvScreen.Home, session.screen)
        session.navigate(TvScreen.AreaFeed)
        assertTrue(session.back())
        assertEquals(TvScreen.Home, session.screen)
    }

    @Test fun idleWakeRestoresTheScreenAndConsumesTheFirstKey() {
        var now = 0L
        val session = TvSession { now }
        session.restore(paired = true)
        session.navigate(TvScreen.Areas)
        now = TvSession.IDLE_TIMEOUT
        session.tick()
        assertEquals(TvScreen.Ambient, session.screen)
        assertTrue(session.interact())
        assertEquals(TvScreen.Areas, session.screen)
        assertFalse(session.interact())
    }

    @Test fun pairingRotatesAtExpiryAndDoesNotEnterAmbient() {
        var now = 0L
        val session = TvSession { now }
        now = TvSession.IDLE_TIMEOUT
        session.tick()
        assertEquals(TvScreen.Pairing, session.screen)
        assertEquals(now + TvSession.PAIRING_LIFETIME, session.pairingExpiresAt)
        assertTrue(session.pairingCode.matches(Regex("[A-HJ-NP-Z2-9]{6}")))
    }
}
