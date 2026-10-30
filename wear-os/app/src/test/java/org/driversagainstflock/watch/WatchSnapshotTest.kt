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
}
