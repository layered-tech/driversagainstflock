package expo.modules.tvcompanion

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.*

class TvCompanionModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("TvCompanion")
        AsyncFunction("request") { host: String, port: Int, fingerprint: String, payload: String ->
            require(host.matches(Regex("[0-9]{1,3}(\\.[0-9]{1,3}){3}"))) { "TV address must be on your local network" }
            val address = InetAddress.getByName(host)
            require(address.isSiteLocalAddress && port in 1..65535)
            require(fingerprint.matches(Regex("[a-f0-9]{64}")))
            require(payload.toByteArray().size <= 1_048_576 && !payload.contains('\n'))
            val trust = object : X509TrustManager {
                override fun getAcceptedIssuers() = emptyArray<X509Certificate>()
                override fun checkClientTrusted(chain: Array<X509Certificate>, auth: String) { throw CertificateException() }
                override fun checkServerTrusted(chain: Array<X509Certificate>, auth: String) {
                    if (chain.isEmpty()) throw CertificateException("TV certificate missing")
                    val actual = MessageDigest.getInstance("SHA-256").digest(chain[0].encoded).joinToString("") { "%02x".format(it) }
                    if (!MessageDigest.isEqual(actual.toByteArray(), fingerprint.toByteArray())) throw CertificateException("TV identity changed. Scan its QR code again.")
                    chain[0].checkValidity()
                }
            }
            val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
            Socket().use { raw ->
                raw.connect(InetSocketAddress(address, port), 5000)
                (ssl.socketFactory.createSocket(raw, host, port, true) as SSLSocket).use { socket ->
                    socket.soTimeout = 8000
                    socket.startHandshake()
                    socket.outputStream.write((payload + "\n").toByteArray())
                    socket.outputStream.flush()
                    val input = socket.inputStream.buffered()
                    val output = ByteArrayOutputStream()
                    while (true) {
                        val byte = input.read()
                        check(byte != -1) { "TV disconnected" }
                        if (byte == 10) break
                        check(output.size() < 1_048_576) { "TV response too large" }
                        output.write(byte)
                    }
                    output.toString("UTF-8")
                }
            }
        }
    }
}
