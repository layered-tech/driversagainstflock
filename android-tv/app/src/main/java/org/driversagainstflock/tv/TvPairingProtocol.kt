package org.driversagainstflock.tv

import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** Authentication and replay boundaries shared by the local TLS endpoint and its tests. */
class TvPairingProtocol(
    private val clock: () -> Long,
    private val code: () -> String,
    private val expiresAt: () -> Long,
    initialTokenHash: String? = null,
    private val persistTokenHash: (String?) -> Unit = {},
    private val receiveSnapshot: (JSONObject) -> Unit = {},
    private val onUnpair: () -> Unit = {},
) {
    private var tokenHash = initialTokenHash
    private var attemptWindow = clock()
    private var attempts = 0
    private var latestRevision = -1L
    private val pending = linkedMapOf<String, JSONObject>()
    val paired: Boolean get() = tokenHash != null

    @Synchronized fun handle(request: JSONObject): JSONObject {
        if (request.optInt("protocolVersion") != 1) return error("unsupported-version")
        val operation = request.optString("operation")
        if (operation == "pair") {
            if (clock() - attemptWindow >= 60_000) { attemptWindow = clock(); attempts = 0 }
            if (++attempts > 5) return error("too-many-attempts")
            if (clock() >= expiresAt()) return error("expired-code")
            if (paired) return error("already-paired")
            if (!equal(request.optString("code"), code())) return error("incorrect-code")
            val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
            val token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
            tokenHash = digest(token)
            persistTokenHash(tokenHash)
            latestRevision = -1
            return success().put("token", token)
        }
        val token = request.optString("token")
        if (token.isBlank() || tokenHash == null || !equal(digest(token), tokenHash!!)) return error("not-paired")
        return when (operation) {
            "snapshot" -> {
                val revision = request.optLong("revision", -1)
                val snapshot = request.optJSONObject("snapshot") ?: return error("missing-snapshot")
                if (revision < 0 || revision <= latestRevision) return error("stale-snapshot")
                if (snapshot.optInt("protocolVersion") != 1 || snapshot.optJSONArray("areas") == null) return error("invalid-snapshot")
                receiveSnapshot(snapshot)
                latestRevision = revision
                success()
            }
            "poll" -> {
                pending.entries.removeAll { it.value.optLong("expiresAt") <= clock() }
                success().put("actions", org.json.JSONArray(pending.values.toList()))
            }
            "ack" -> {
                pending.remove(request.optString("id"))
                success()
            }
            "unpair" -> { reset(); success() }
            else -> error("unknown-operation")
        }
    }

    @Synchronized fun enqueue(type: String, payload: JSONObject): Boolean {
        if (!paired || type !in setOf("camera", "watch-camera") || pending.size >= 20) return false
        val id = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(18).also { SecureRandom().nextBytes(it) })
        pending[id] = JSONObject().put("id", id).put("type", type).put("payload", payload).put("expiresAt", clock() + 60_000)
        return true
    }

    @Synchronized fun reset() {
        tokenHash = null
        latestRevision = -1
        pending.clear()
        persistTokenHash(null)
        onUnpair()
    }

    companion object {
        fun digest(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
        private fun equal(a: String, b: String) = MessageDigest.isEqual(a.toByteArray(), b.toByteArray())
        private fun success() = JSONObject().put("ok", true).put("protocolVersion", 1)
        private fun error(reason: String) = JSONObject().put("ok", false).put("error", reason).put("protocolVersion", 1)
    }
}
