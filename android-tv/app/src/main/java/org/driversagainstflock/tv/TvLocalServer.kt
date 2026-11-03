package org.driversagainstflock.tv

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.NetworkInterface
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.util.Date
import java.util.concurrent.Executors
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import javax.net.ssl.*
import javax.security.auth.x500.X500Principal

/** One bounded JSON request per TLS connection. No household data is sent to a relay. */
class TvLocalServer(private val context: Context, private val protocol: TvPairingProtocol, private val requestedPort: Int = 38477) : AutoCloseable {
    private var server: SSLServerSocket? = null
    private val acceptor = Executors.newSingleThreadExecutor()
    private val workers = ThreadPoolExecutor(2, 4, 30, TimeUnit.SECONDS, ArrayBlockingQueue(8))
    private var registration: NsdManager.RegistrationListener? = null
    var fingerprint = ""
        private set
    var port = 0
        private set

    fun start() {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val alias = "daf-tv-local-tls-ec-v1"
        if (!store.containsAlias(alias)) {
            KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").apply {
                initialize(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                    .setAlgorithmParameterSpec(java.security.spec.ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_NONE, KeyProperties.DIGEST_SHA256)
                    .setCertificateSubject(X500Principal("CN=DAF TV"))
                    .setCertificateNotBefore(Date(System.currentTimeMillis() - 86_400_000))
                    .setCertificateNotAfter(Date(System.currentTimeMillis() + 10L * 365 * 86_400_000)).build())
                generateKeyPair()
            }
        }
        val certificate = store.getCertificate(alias)
        fingerprint = MessageDigest.getInstance("SHA-256").digest(certificate.encoded).joinToString("") { "%02x".format(it) }
        val managers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()).apply { init(store, null) }
        val ssl = SSLContext.getInstance("TLS").apply { init(managers.keyManagers, null, null) }
        server = (ssl.serverSocketFactory.createServerSocket(requestedPort) as SSLServerSocket).apply {
            enabledProtocols = supportedProtocols.filter { it == "TLSv1.2" || it == "TLSv1.3" }.toTypedArray()
        }
        port = server!!.localPort
        register()
        acceptor.execute {
            while (server?.isClosed == false) {
                val socket = try { server!!.accept() as SSLSocket } catch (_: Exception) { break }
                try { workers.execute { handle(socket) } } catch (_: java.util.concurrent.RejectedExecutionException) { socket.close() }
            }
        }
    }

    fun address(): String? = NetworkInterface.getNetworkInterfaces().toList()
        .filter { it.isUp && !it.isLoopback }.flatMap { it.inetAddresses.toList() }
        .filterIsInstance<java.net.Inet4Address>().firstOrNull { it.isSiteLocalAddress }?.hostAddress

    private fun handle(socket: SSLSocket) {
        socket.use {
            try {
                socket.soTimeout = 8_000
                socket.startHandshake()
                val input = socket.inputStream.buffered()
                val bytes = ByteArrayOutputStream()
                while (true) {
                    val byte = input.read()
                    if (byte == -1) return
                    if (byte == 10) break
                    if (bytes.size() >= 1_048_576) return
                    bytes.write(byte)
                }
                val response = protocol.handle(JSONObject(bytes.toString("UTF-8")))
                socket.outputStream.write((response.toString() + "\n").toByteArray())
                socket.outputStream.flush()
            } catch (_: Exception) { /* Invalid or disconnected peers get no state. */ }
        }
    }

    private fun register() {
        val listener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(info: NsdServiceInfo) = Unit
            override fun onRegistrationFailed(info: NsdServiceInfo, error: Int) = Unit
            override fun onServiceUnregistered(info: NsdServiceInfo) = Unit
            override fun onUnregistrationFailed(info: NsdServiceInfo, error: Int) = Unit
        }
        registration = listener
        context.getSystemService(NsdManager::class.java).registerService(NsdServiceInfo().apply {
            serviceName = "Drivers Against Flock TV"
            serviceType = "_daf-tv._tcp."
            port = this@TvLocalServer.port
            setAttribute("version", "1")
            setAttribute("fingerprint", fingerprint)
        }, NsdManager.PROTOCOL_DNS_SD, listener)
    }

    override fun close() {
        registration?.let { try { context.getSystemService(NsdManager::class.java).unregisterService(it) } catch (_: Exception) {} }
        server?.close()
        acceptor.shutdownNow()
        workers.shutdownNow()
    }
}
