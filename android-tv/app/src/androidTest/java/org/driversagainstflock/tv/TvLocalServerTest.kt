package org.driversagainstflock.tv

import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.security.MessageDigest
import java.security.cert.X509Certificate
import javax.net.ssl.*

class TvLocalServerTest {
    @Test fun tlsPairSyncAndUnpairRoundTripWithCertificatePinning() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        var synced = false
        var cleared = false
        val protocol = TvPairingProtocol({ 100L }, { "ABC234" }, { 10_000L },
            receiveSnapshot = { synced = TvSnapshot.areas(it).isEmpty() }, onUnpair = { cleared = true })
        TvLocalServer(context, protocol, requestedPort = 0).use { server ->
            server.start()
            val pair = exchange(server.port, server.fingerprint, JSONObject().put("operation", "pair").put("code", "ABC234"))
            assertTrue(pair.getBoolean("ok"))
            val token = pair.getString("token")
            val sync = exchange(server.port, server.fingerprint, JSONObject().put("operation", "snapshot").put("token", token).put("revision", 1)
                .put("snapshot", JSONObject("""{"protocolVersion":1,"areas":[]}""")))
            assertTrue(sync.getBoolean("ok"))
            assertTrue(synced)
            assertTrue(exchange(server.port, server.fingerprint, JSONObject().put("operation", "unpair").put("token", token)).getBoolean("ok"))
            assertTrue(cleared)
            assertFalse(exchange(server.port, server.fingerprint, JSONObject().put("operation", "poll").put("token", token)).getBoolean("ok"))
            try {
                exchange(server.port, "0".repeat(64), JSONObject().put("operation", "pair"))
                fail("A different TV certificate must be rejected")
            } catch (_: SSLException) { }
        }
    }

    private fun exchange(port: Int, fingerprint: String, request: JSONObject): JSONObject {
        val trust = object : X509TrustManager {
            override fun getAcceptedIssuers() = emptyArray<X509Certificate>()
            override fun checkClientTrusted(chain: Array<X509Certificate>, auth: String) { throw java.security.cert.CertificateException() }
            override fun checkServerTrusted(chain: Array<X509Certificate>, auth: String) {
                val actual = MessageDigest.getInstance("SHA-256").digest(chain.first().encoded).joinToString("") { "%02x".format(it) }
                if (actual != fingerprint) throw java.security.cert.CertificateException("Wrong TV")
            }
        }
        val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
        return (ssl.socketFactory.createSocket("127.0.0.1", port) as SSLSocket).use { socket ->
            socket.soTimeout = 5000
            socket.startHandshake()
            socket.outputStream.write((request.put("protocolVersion", 1).toString() + "\n").toByteArray())
            socket.outputStream.flush()
            JSONObject(socket.inputStream.bufferedReader().readLine())
        }
    }
}
