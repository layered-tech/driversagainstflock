package org.driversagainstflock.watch

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class WatchSnapshotTest {
    private fun fixture() = javaClass.classLoader!!.getResource("active.json")!!.readText()
    private fun snapshot(revision: Int = 1, publisher: String = "fixture-phone", startedAt: Long = 1000): WatchSnapshot {
        val json = JSONObject(fixture()).put("revision", revision).put("publisherId", publisher).put("publisherStartedAt", startedAt)
        return WatchSnapshot.parse(json.toString())
    }
    @Test fun sharedPhoneFixtureDecodes() {
        val state = snapshot()
        assertEquals("right", state.navigation.getJSONObject("maneuver").getString("kind"))
        assertEquals(3, state.scorecard.getInt("cameraCrossings"))
        assertEquals(4, state.scorecard.getInt("avoidedCameras"))
        assertEquals("drive-1", state.sessionId)
    }
    @Test fun productionPhonePayloadIsSupportedAndUnknownEnvironmentsAreRejected() {
        val json = JSONObject(fixture()).put("environment", "production")
        assertEquals("drive-1", WatchSnapshot.parse(json.toString()).sessionId)
        json.put("environment", "unknown")
        assertTrue(runCatching { WatchSnapshot.parse(json.toString()) }.isFailure)
    }
    @Test fun staleUsesSourceTimeNotReceiptOrPublishTime() {
        val json = JSONObject(fixture()).put("publishedAt", 90_000)
        val state = WatchSnapshot.parse(json.toString())
        assertFalse(state.stale(16999))
        assertTrue(state.stale(17000))
        assertTrue(state.stale(90_000))
        assertTrue(state.stale(-4000))
    }
    @Test fun rejectsOlderAndDuplicateRevisionsAndRetiredPublishers() {
        val gate = SnapshotGate()
        assertTrue(gate.accept(snapshot(4)))
        assertFalse(gate.accept(snapshot(4)))
        assertFalse(gate.accept(snapshot(3)))
        assertTrue(gate.accept(snapshot(5)))
        assertTrue(gate.accept(snapshot(1, "restarted", 2000)))
        assertFalse(gate.accept(snapshot(999)))
        assertFalse(gate.accept(snapshot(1, "old-phone", 500)))
    }
    @Test fun incompatibleAndMalformedPayloadsAreRejected() {
        listOf("{}", "not json", JSONObject(fixture()).put("protocolVersion", 2).toString(),
            JSONObject(fixture()).put("navigation", JSONObject().put("status", "unknown")).toString()).forEach {
            assertTrue(runCatching { WatchSnapshot.parse(it) }.isFailure)
        }
    }
    @Test fun rejectsNegativeAvoidedCount() {
        val json = JSONObject(fixture())
        json.getJSONObject("scorecard").put("avoidedCameras", -1)
        assertTrue(runCatching { WatchSnapshot.parse(json.toString()) }.isFailure)
    }
    @Test fun cancellationClearsSessionAndReroutingDropsManeuver() {
        val json = JSONObject(fixture())
        json.getJSONObject("navigation").put("status", "idle").put("sessionId", JSONObject.NULL).put("maneuver", JSONObject.NULL)
        assertNull(WatchSnapshot.parse(json.toString()).sessionId)
        json.getJSONObject("navigation").put("status", "rerouting").put("sessionId", "drive-1")
        assertNull(WatchSnapshot.parse(json.toString()).navigation.optJSONObject("maneuver"))
    }
    @Test fun quickAccessDistinguishesUnreadStaleUnavailableAndGuidance() {
        val json = JSONObject(fixture())
        json.put("areas", JSONObject().put("status", "ready").put("sourceAt", 2000)
            .put("items", org.json.JSONArray().put(JSONObject().put("id", 7).put("name", "Oakland")
                .put("unreadCount", 4).put("cameraCount", 100).put("changes", org.json.JSONArray()))))
        val idle = JSONObject(json.toString())
        idle.getJSONObject("navigation").put("status", "idle").put("sessionId", JSONObject.NULL).put("maneuver", JSONObject.NULL)
        val snapshot = WatchSnapshot.parse(idle.toString())
        assertEquals("areas", quickAccess(snapshot, 3000, true).mode)
        assertEquals(4, quickAccess(snapshot, 3000, true).unread)
        idle.getJSONObject("areas").getJSONArray("items").getJSONObject(0).put("unreadCount", 0)
        assertEquals("1 area watched", quickAccess(WatchSnapshot.parse(idle.toString()), 3000, true).detail)
        idle.getJSONObject("areas").getJSONArray("items").getJSONObject(0)
            .put("unreadCount", 4).put("addedCount", 2).put("removedCount", 1)
        assertEquals("Oakland +2 −1", quickAccess(WatchSnapshot.parse(idle.toString()), 3000, true).detail)
        assertEquals("stale", quickAccess(snapshot, 3_602_000, true).mode)
        assertEquals("Updated 1h ago", quickAccess(snapshot, 3_602_000, true).chip)
        assertEquals("Oakland +2 −1", quickAccess(WatchSnapshot.parse(idle.toString()), 3_602_000, true).detail)
        assertEquals("unavailable", quickAccess(snapshot, 86_402_001, false).mode)
        assertEquals("Last synced yesterday", quickAccess(snapshot, 86_402_001, false).sub)
        val guidance = quickAccess(WatchSnapshot.parse(json.toString()), 3000, true)
        assertEquals("navigation", guidance.mode)
        assertEquals("right", guidance.maneuverKind)
        assertEquals("400 ft", guidance.title)
        assertTrue(guidance.sub.contains("27 min"))
        assertTrue(guidance.sub.contains("13.0 mi"))
        val moved = JSONObject(json.toString())
        moved.getJSONObject("navigation").getJSONObject("maneuver").put("distanceMeters", 75)
        assertNotEquals(guidance, quickAccess(WatchSnapshot.parse(moved.toString()), 3000, true))
        assertEquals("navigation", quickAccess(WatchSnapshot.parse(json.toString()), 30_000, true).mode)
        assertEquals("stale", quickAccess(WatchSnapshot.parse(json.toString()), 3_602_000, false).mode)
    }
    @Test fun ongoingActivityUsesTheCurrentManeuverGlance() {
        val state = snapshot()
        assertEquals(OngoingGlance("400 ft", "Market St"), ongoingGlance(state))
        val rerouting = JSONObject(fixture())
        rerouting.getJSONObject("navigation").put("status", "rerouting").put("maneuver", JSONObject.NULL)
        assertEquals(OngoingGlance("Guidance updating", "Tap to return to guidance"),
            ongoingGlance(WatchSnapshot.parse(rerouting.toString())))
    }
}
