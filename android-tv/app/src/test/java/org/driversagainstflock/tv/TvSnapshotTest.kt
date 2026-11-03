package org.driversagainstflock.tv

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class TvSnapshotTest {
    @Test fun cachedSnapshotRestoresValidatedAreasWithoutExtraFields() {
        val input = JSONObject("""{"protocolVersion":1,"token":"secret","areas":[{"id":1,"name":"Around home","kind":"radius","description":"5 mi radius","cadence":"Daily","cameraCount":2,"changesStatus":"ready","mappedCameras":[{"latitude":37.8,"longitude":-122.2}],"changes":[{"id":3,"street":"Grand Ave","kind":"added","changedAt":1762104000000,"latitude":37.8,"longitude":-122.2}]}]}""")
        val areas = TvSnapshot.areas(input)
        val cache = TvSnapshot.encode(areas, 1234L)
        assertFalse(cache.has("token"))
        assertEquals(1234L, cache.getLong("receivedAt"))
        assertEquals("radius", areas.single().kind)
        assertEquals("Daily", areas.single().cadence)
        assertEquals(TvMapPoint(-122.2, 37.8), areas.single().mappedCameras.single())
        assertEquals(1762104000000L, areas.single().changes.single().changedAt ?: 0L)
        assertEquals(areas, TvSnapshot.areas(JSONObject(cache.toString())))
    }
    @Test fun unavailableCoordinatesSurviveCachingWithoutInventingALocation() {
        val input = JSONObject("""{"protocolVersion":1,"areas":[{"id":1,"changes":[{"id":3,"latitude":null,"longitude":null}]}]}""")
        val restored = TvSnapshot.areas(TvSnapshot.encode(TvSnapshot.areas(input), 0L))
        assertTrue(restored.single().changes.single().latitude.isNaN())
        assertTrue(restored.single().changes.single().longitude.isNaN())
    }
}
