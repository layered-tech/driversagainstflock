package org.driversagainstflock.tv
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class TvRoutesTest {
    @Test fun invalidCoordinatesCannotEnterTheMap() {
        for (value in listOf("""{"name":"X","latitude":91,"longitude":0}""", """{"name":"X","latitude":0,"longitude":181}""")) {
            try { TvPlace.parse(JSONObject(value)); fail("invalid coordinate") } catch (_: IllegalArgumentException) { }
        }
    }
    @Test fun routesAreNotAvailableToPairedPhonesOrTheTv() {
        val protocol = TvPairingProtocol({0L}, {"ABC234"}, {1000L})
        fun request(op: String) = JSONObject().put("protocolVersion", 1).put("operation", op)
        val token = protocol.handle(request("pair").put("code", "ABC234")).getString("token")
        assertFalse(protocol.enqueue("route-preview", JSONObject()))
        assertFalse(protocol.enqueue("route-proposal", JSONObject()))
        assertEquals("unknown-operation", protocol.handle(request("preview-result").put("token", token)).getString("error"))
        assertEquals(0, protocol.handle(request("poll").put("token", token)).getJSONArray("actions").length())
        assertFalse(TvScreen.entries.any { it.name == "Route" })
        assertTrue(protocol.enqueue("camera", JSONObject()))
    }
}
