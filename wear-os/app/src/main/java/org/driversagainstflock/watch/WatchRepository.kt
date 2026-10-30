package org.driversagainstflock.watch

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject

interface WatchPresentation {
    val snapshot: WatchSnapshot?
    val connected: Boolean
    val incompatible: Boolean
    val remoteProtocolVersion: Int?
    val connectionChecked: Boolean
    val received: Int
    val dropped: Int
    val lastError: String
    val pingStatus: String
    val hapticStatus: String
    val endedAt: Long?
    val endedByArrival: Boolean
    val history: List<String>
    fun refresh(request: Boolean = false)
    fun preview(pattern: String)
}

class WatchRepository private constructor(private val context: Context) : WatchPresentation {
    companion object {
        @Volatile private var instance: WatchRepository? = null
        fun get(context: Context): WatchRepository = instance ?: synchronized(this) {
            instance ?: WatchRepository(context.applicationContext).also { instance = it }
        }
    }
    private val handler = Handler(Looper.getMainLooper())
    private val prefs = context.getSharedPreferences("watch_state", 0)
    private val gate = SnapshotGate()
    private val haptics = WatchHaptics(context)
    private val ongoingActivity = WatchOngoingActivity(context)
    private var pendingCue: WatchCue? = null
    private var lastPlayedCueId = prefs.getString("last_cue_id", null)
    override var snapshot by mutableStateOf<WatchSnapshot?>(null); private set
    override var connected by mutableStateOf(false); private set
    override var remoteProtocolVersion by mutableStateOf<Int?>(null); private set
    override var connectionChecked by mutableStateOf(false); private set
    override var incompatible by mutableStateOf(false); private set
    override var received by mutableStateOf(0); private set
    override var dropped by mutableStateOf(0); private set
    override var lastError by mutableStateOf("none"); private set
    var pingMs by mutableStateOf<Long?>(null); private set
    override var pingStatus by mutableStateOf("Not measured"); private set
    override var hapticStatus by mutableStateOf(haptics.suppressionReason() ?: "Ready"); private set
    override var endedAt by mutableStateOf<Long?>(null); private set
    override var endedByArrival by mutableStateOf(false); private set
    override var history by mutableStateOf<List<String>>(emptyList()); private set
    private var nodeId: String? = null
    private var pingStartedAt: Long? = null
    private var pingToken: String? = null
    private var lastPingAttemptAt = 0L
    private var refreshing = false
    init {
        prefs.getString("snapshot", null)?.let { value ->
            runCatching { WatchSnapshot.parse(value) }.getOrNull()?.let { gate.accept(it); snapshot = it }
        }
    }
    private fun record(event: String) { history = (history + event).takeLast(20) }
    fun accept(payload: String) = handler.post {
        received += 1
        val parsedJson = runCatching { JSONObject(payload) }.getOrNull()
        if (parsedJson?.has("protocolVersion") == true) remoteProtocolVersion = parsedJson.optInt("protocolVersion", -1)
        if (parsedJson?.optInt("protocolVersion", -1) != PROTOCOL_VERSION && parsedJson?.has("protocolVersion") == true) {
            incompatible = true; dropped += 1; lastError = "Incompatible protocol"; record(lastError)
            return@post
        }
        val next = runCatching { WatchSnapshot.parse(payload) }.getOrElse {
            dropped += 1; lastError = "Invalid snapshot"; record(lastError); return@post
        }
        if (!gate.accept(next)) { dropped += 1; record("Older or duplicate revision"); return@post }
        val previous = snapshot
        if (previous?.sessionId != null && next.sessionId == null) {
            endedAt = System.currentTimeMillis()
            endedByArrival = previous.navigation.optJSONObject("maneuver")?.optString("kind") == "arrive"
        } else if (next.sessionId != null) endedAt = null
        snapshot = next
        ongoingActivity.update(next)
        playPendingCue()
        incompatible = false
        lastError = "none"
        prefs.edit().putString("snapshot", payload).apply()
        record("Accepted revision ${next.revision}")
    }
    fun acceptCue(payload: String) = handler.post {
        val cue = runCatching { WatchCue.parse(payload) }.getOrElse {
            dropped += 1; record("Invalid haptic cue"); return@post
        }
        if (cue.id == lastPlayedCueId || !cue.eligible(snapshot, System.currentTimeMillis()) && cue.preview) {
            dropped += 1; return@post
        }
        pendingCue = cue
        playPendingCue()
    }
    private fun playPendingCue() {
        val cue = pendingCue ?: return
        val now = System.currentTimeMillis()
        if (now >= cue.expiresAt || cue.id == lastPlayedCueId) {
            pendingCue = null; dropped += 1; record("Expired or duplicate cue"); return
        }
        if (!cue.eligible(snapshot, now)) return
        pendingCue = null
        lastPlayedCueId = cue.id
        prefs.edit().putString("last_cue_id", cue.id).apply()
        haptics.play(cue.pattern)?.let { hapticStatus = it; record("Cue suppressed: $it"); return }
        hapticStatus = "Ready"
        record("Played ${cue.pattern} cue")
    }
    override fun preview(pattern: String) {
        haptics.play(pattern)?.let { hapticStatus = it; record("Preview suppressed: $it"); return }
        hapticStatus = "Ready"
        record("Previewed $pattern")
    }
    fun refreshOngoingActivity() {
        snapshot?.let(ongoingActivity::update)
    }
    override fun refresh(request: Boolean) {
        hapticStatus = haptics.suppressionReason() ?: "Ready"
        if (refreshing) return
        pingStartedAt?.let { if (SystemClock.elapsedRealtime() - it >= 5_000) {
            pingStartedAt = null; pingToken = null; connected = false
            pingStatus = "Timed out — retry"; error("Ping timed out")
        } }
        refreshing = true
        Wearable.getCapabilityClient(context).getCapability("daf_phone_v1", CapabilityClient.FILTER_REACHABLE)
            .addOnSuccessListener { capability ->
                val nextNode = capability.nodes.sortedBy { !it.isNearby }.firstOrNull()?.id
                if (nextNode != null) updatePeer(nextNode, advertised = true, request)
                else discoverConnectedPeer(request)
            }.addOnFailureListener { discoverConnectedPeer(request) }
        if (request) {
            Wearable.getDataClient(context).dataItems.addOnSuccessListener { items ->
                try {
                    items.forEach { item -> if (item.uri.path == "/daf/watch/state") {
                        DataMapItem.fromDataItem(item).dataMap.getString("snapshot")?.let(::accept)
                    } }
                } finally { items.release() }
            }.addOnFailureListener { error("Cached state unavailable") }
        }
    }
    private fun discoverConnectedPeer(request: Boolean) {
        // Capability metadata may lag behind the connection; only an app-scoped pong confirms this fallback.
        Wearable.getNodeClient(context).connectedNodes.addOnSuccessListener { nodes ->
            val nextNode = nodes.firstOrNull { it.id == nodeId } ?: nodes.sortedBy { !it.isNearby }.firstOrNull()
            updatePeer(nextNode?.id, advertised = false, request)
        }.addOnFailureListener {
            refreshing = false; connectionChecked = true; connected = false; error("Connection check failed")
        }
    }
    private fun updatePeer(nextNode: String?, advertised: Boolean, request: Boolean) {
        refreshing = false
        connectionChecked = true
        val changed = nextNode != nodeId
        if (changed || nextNode == null) {
            connected = false; pingStartedAt = null; pingToken = null
        }
        nodeId = nextNode
        if (nextNode == null) { pingStatus = "Phone disconnected"; return }
        if (advertised) connected = true
        if (changed || request || (!advertised && pingStartedAt == null && SystemClock.elapsedRealtime() - lastPingAttemptAt >= 10_000)) {
            send(nextNode, "/daf/watch/request", byteArrayOf())
            ping()
        }
    }
    private fun send(node: String, path: String, data: ByteArray) {
        Wearable.getMessageClient(context).sendMessage(node, path, data)
            .addOnFailureListener { error("Message delivery failed") }
    }
    fun ping() {
        val node = nodeId ?: run { pingStatus = "Phone disconnected"; return }
        pingStartedAt = SystemClock.elapsedRealtime()
        lastPingAttemptAt = pingStartedAt!!
        pingToken = pingStartedAt.toString()
        pingStatus = "Waiting…"
        send(node, "/daf/watch/ping", pingToken!!.toByteArray())
    }
    fun pong(sourceNodeId: String, data: ByteArray) = handler.post {
        if (sourceNodeId == nodeId && data.size <= 64 && data.toString(Charsets.UTF_8) == pingToken) {
            connected = true
            pingMs = pingStartedAt?.let { SystemClock.elapsedRealtime() - it }
            pingStatus = "${pingMs} ms"
            pingStartedAt = null; pingToken = null
            record("Ping $pingStatus")
        }
    }
    private fun error(message: String) { lastError = message; record(message) }
}
