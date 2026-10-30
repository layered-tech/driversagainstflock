package org.driversagainstflock.watch

import org.junit.Assert.assertEquals
import org.junit.Test

class WatchFormattingTest {
    @Test fun distanceEstimatesMatchPhoneThresholds() {
        assertEquals("—", distance(null))
        assertEquals("0 ft", distance(0.0))
        assertEquals("50 ft", distance(1.0))
        assertEquals("150 ft", distance(43.043388))
        assertEquals("400 ft", distance(120.0))
        assertEquals("500 ft", distance(160.0))
        assertEquals("0.1 mi", distance(161.0))
        assertEquals("1.2 mi", distance(1985.84))
        assertEquals("10 mi", distance(16093.44))
        assertEquals("—", traveledDistance(null))
        assertEquals("0.0 mi", traveledDistance(0.0028))
        assertEquals("4.0 mi", traveledDistance(6400.0))
    }
    @Test fun remainingTimeMatchesPhoneRoundingAndHourDisplay() {
        assertEquals("—", duration(null))
        assertEquals("1 min", duration(0.0))
        assertEquals("3 min", duration(193.864))
        assertEquals("4 min", duration(210.0))
        assertEquals("1 hr", duration(3599.0))
        assertEquals("1 hr 1 min", duration(3660.0))
        assertEquals("18:42", elapsed(1122.0))
        assertEquals("—", elapsed(null))
    }
}
