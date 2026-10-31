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
        assertEquals("stale", quickAccess(snapshot, 3_602_000, true).mode)
        assertEquals("unavailable", quickAccess(snapshot, 86_402_001, false).mode)
        assertEquals("navigation", quickAccess(WatchSnapshot.parse(json.toString()), 3000, true).mode)
    }
}
