package org.driversagainstflock.watch

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class WatchManeuverPresentationTest {
    private fun snapshot(kind: String, exit: Long? = null): WatchSnapshot {
        val json = JSONObject(javaClass.classLoader!!.getResource("active.json")!!.readText())
        json.getJSONObject("navigation").getJSONObject("maneuver")
            .put("kind", kind).put("exitNumber", exit ?: JSONObject.NULL)
        return WatchSnapshot.parse(json.toString())
    }

    @Test fun everyManeuverSelectsItsOwnDrawable() {
        val resources = mapOf(
            "left" to R.drawable.maneuver_left, "right" to R.drawable.maneuver_right,
            "sharp-left" to R.drawable.maneuver_sharp_left, "sharp-right" to R.drawable.maneuver_sharp_right,
            "slight-left" to R.drawable.maneuver_slight_left, "slight-right" to R.drawable.maneuver_slight_right,
            "keep-left" to R.drawable.maneuver_keep_left, "keep-right" to R.drawable.maneuver_keep_right,
            "straight" to R.drawable.maneuver_straight, "roundabout" to R.drawable.maneuver_roundabout,
            "uturn" to R.drawable.maneuver_uturn, "depart" to R.drawable.maneuver_depart,
            "arrive" to R.drawable.maneuver_arrive,
        )
        resources.forEach { (kind, resource) -> assertEquals(resource, maneuverResourceId(kind)) }
        assertEquals(13, resources.values.toSet().size)
    }

    @Test fun roundaboutExitIsOnlyPresentForValidRoundabouts() {
        listOf(1L, 9L, 10L, 19L).forEach { exit ->
            val state = snapshot("roundabout", exit)
            val tile = quickAccess(state, 3000, true)
            assertEquals(exit, tile.maneuverExitNumber)
            assertEquals("Roundabout exit $exit", maneuverDescription(tile.maneuverKind, tile.maneuverExitNumber))
            assertTrue(ongoingGlance(state).detail.startsWith("Exit $exit · "))
        }
        listOf(null, 0L, -1L).forEach { exit ->
            assertNull(maneuverExitNumber("roundabout", exit))
        }
        assertNull(quickAccess(snapshot("roundabout"), 3000, true).maneuverExitNumber)
        assertNull(quickAccess(snapshot("left", 3), 3000, true).maneuverExitNumber)
        assertEquals("roundabout", maneuverDescription("roundabout", null))
    }

    @Test fun notificationIdentityChangesWhenOnlyKindOrExitChanges() {
        val right = snapshot("right")
        val left = snapshot("left")
        assertEquals(ongoingGlance(right), ongoingGlance(left))
        assertNotEquals(ongoingGlanceKey(right), ongoingGlanceKey(left))
        val first = snapshot("roundabout", 1)
        val second = snapshot("roundabout", 2)
        assertNotEquals(ongoingGlanceKey(first), ongoingGlanceKey(second))
        assertEquals(ongoingGlanceKey(first), ongoingGlanceKey(snapshot("roundabout", 1)))
    }
}
