package org.driversagainstflock.tv

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class TvPairingProtocolTest {
    private fun request(operation: String) = JSONObject().put("protocolVersion", 1).put("operation", operation)
    @Test fun onlyThePairingCodeCanMintACredentialAndOnlyItsHashPersists() {
        var stored: String? = null
        val protocol = TvPairingProtocol({ 100L }, { "ABC234" }, { 1000L }, persistTokenHash = { stored = it })
        assertFalse(protocol.handle(request("pair").put("code", "WRONG" )).getBoolean("ok"))
        val token = protocol.handle(request("pair").put("code", "ABC234")).getString("token")
        assertEquals(TvPairingProtocol.digest(token), stored)
        assertNotEquals(token, stored)
        assertFalse(protocol.handle(request("pair").put("code", "ABC234")).getBoolean("ok"))
        assertFalse(protocol.handle(request("poll").put("token", "wrong")).getBoolean("ok"))
        assertTrue(protocol.handle(request("poll").put("token", token)).getBoolean("ok"))
    }
    @Test fun expiryAndRateLimitRejectPairingAttempts() {
        var now = 0L
        val protocol = TvPairingProtocol({ now }, { "ABC234" }, { 120_000L })
        repeat(5) { protocol.handle(request("pair").put("code", "WRONG")) }
        assertEquals("too-many-attempts", protocol.handle(request("pair").put("code", "ABC234")).getString("error"))
        now = 120_000
        assertEquals("expired-code", protocol.handle(request("pair").put("code", "ABC234")).getString("error"))
    }
    @Test fun unpairRevokesTheCredentialAndDropsPendingActions() {
        var now = 0L
        var cleared = false
        val protocol = TvPairingProtocol({ now }, { "ABC234" }, { 1000L }, onUnpair = { cleared = true })
        val token = protocol.handle(request("pair").put("code", "ABC234")).getString("token")
        assertTrue(protocol.enqueue("camera", JSONObject().put("id", 1)))
        assertEquals(1, protocol.handle(request("poll").put("token", token)).getJSONArray("actions").length())
        now = 60_000
        assertEquals(0, protocol.handle(request("poll").put("token", token)).getJSONArray("actions").length())
        protocol.handle(request("unpair").put("token", token))
        assertTrue(cleared)
        assertFalse(protocol.paired)
        assertFalse(protocol.handle(request("poll").put("token", token)).getBoolean("ok"))
    }
    @Test fun replayedSnapshotsCannotReplaceNewerState() {
        var updates = 0
        val protocol = TvPairingProtocol({ 0L }, { "ABC234" }, { 1000L }, receiveSnapshot = { updates++ })
        val token = protocol.handle(request("pair").put("code", "ABC234")).getString("token")
        val snapshot = request("snapshot").put("token", token).put("revision", 1)
            .put("snapshot", JSONObject("""{"protocolVersion":1,"areas":[]}"""))
        assertTrue(protocol.handle(snapshot).getBoolean("ok"))
        assertFalse(protocol.handle(snapshot).getBoolean("ok"))
        assertEquals(1, updates)
    }
}
