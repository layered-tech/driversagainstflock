package org.driversagainstflock.tv

import org.junit.Assert.*
import org.junit.Test

class TvMapDataTest {
    private val center = TvCamera("center", 0.0, 0.0, "Center")
    @Test fun directionalSelectionNeverMovesOppositeToTheRemote() {
        val left = TvCamera("left", -1.0, 0.0, "Left")
        val right = TvCamera("right", 1.0, 0.0, "Right")
        val north = TvCamera("north", 0.0, 1.0, "North")
        val points = listOf(center, left, right, north)
        assertEquals(right, nextCamera(points, center, 1, 0))
        assertEquals(left, nextCamera(points, center, -1, 0))
        assertEquals(north, nextCamera(points, center, 0, 1))
        assertEquals(center, nextCamera(points, center, 0, -1))
        assertNull(nextCamera(emptyList(), null, 1, 0))
    }
    @Test fun malformedCoordinatesAreDroppedAndIdsAreDeduplicated() {
        val result = TvMarkerParser.parse("""{"points":[
            {"location":[-122.2,37.8],"properties":{"id":"a"}},
            {"location":[-122.2,37.8],"properties":{"id":"a"}},
            {"location":[1,91],"properties":{"id":"b"}},
            {"location":[null,1],"properties":{"id":"c"}},
            {"location":[0,0],"properties":{}}
        ]}""")
        assertEquals(1, result.size)
        assertEquals("a", result.single().id)
        assertEquals("Mapped ALPR camera", result.single().street)
        assertEquals(-122.2, result.single().longitude, 0.0)
    }
}
