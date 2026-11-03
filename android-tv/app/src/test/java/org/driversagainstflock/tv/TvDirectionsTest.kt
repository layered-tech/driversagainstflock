package org.driversagainstflock.tv

import org.junit.Assert.*
import org.junit.Test

class TvDirectionsTest {
    @Test fun cardinalNumericAndMultipleDirectionsMatchThePhone() {
        assertEquals(listOf(90.0, 270.0), cameraDirections("E;W"))
        assertEquals(listOf(90.0, 270.0), cameraDirections("90-270"))
        assertEquals(listOf(337.5, 22.5), cameraDirections("NNW,NNE"))
        assertEquals(listOf(270.0, 0.0), cameraDirections("-90;360"))
        assertEquals(listOf(270.0), cameraDirections("Westbound · 40° cone"))
        assertTrue(cameraDirections("Unknown").isEmpty())
        assertTrue(cameraDirections("").isEmpty())
    }

    @Test fun mappedDirectionsSurviveSnapshotCaching() {
        val area = TvArea(1, "City", "", 1, 0, 0, "Instant", emptyList(), mappedCameras = listOf(TvMapPoint(-122.2, 37.8, "90;270")))
        assertEquals(area, TvSnapshot.areas(TvSnapshot.encode(listOf(area), 0)).single())
    }
}
