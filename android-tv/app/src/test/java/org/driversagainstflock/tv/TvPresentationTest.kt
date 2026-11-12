package org.driversagainstflock.tv

import org.junit.Assert.*
import org.junit.Test

class TvPresentationTest {
    private val area = TvArea(1, "Around home", "5 mi radius", 23, 1, 0, "Daily", emptyList(), kind = "radius")

    @Test fun compactMetadataFitsTheShelfWithoutRepeatingTheRadius() {
        assertEquals("5 mi · 23 cameras", area.subtitle())
        assertEquals("5 mi · 23 cameras mapped", area.subtitle(full = true))
        assertEquals("5 mi · Centered on Grand Lake · 23 cameras mapped", area.copy(description = "5 mi · Centered on Grand Lake").subtitle(full = true))
        assertEquals("Drawn · 3 cameras", area.copy(kind = "drawn", description = "3.8 sq mi", cameraCount = 3).subtitle())
    }

    @Test fun missingHistoryIsUnknownRatherThanSevenQuietWeeks() {
        assertEquals(List(7) { null } + 1, area.historyBars())
        assertEquals(List<Int?>(8) { null }, area.copy(feedAvailable = false).historyBars())
        val counts = listOf(0, 1, 0, 0, 1, 0, 0, 1)
        assertEquals(counts, area.copy(weeklyChanges = counts).historyBars())
    }

    @Test fun weeklyHistorySurvivesTheHouseholdCache() {
        val withHistory = area.copy(weeklyChanges = listOf(0, 1, 0, 0, 1, 0, 0, 1))
        assertEquals(withHistory, TvSnapshot.areas(TvSnapshot.encode(listOf(withHistory), 100)).single())
    }
}
