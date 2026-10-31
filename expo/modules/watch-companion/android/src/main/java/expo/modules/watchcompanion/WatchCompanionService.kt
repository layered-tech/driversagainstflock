package expo.modules.watchcompanion

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONArray
import org.json.JSONObject

class WatchCompanionService : WearableListenerService() {
    companion object {
        @Volatile var requestCurrentState: (() -> Unit)? = null
        @Volatile var areaOpened: ((Int) -> Unit)? = null
        private const val PENDING_READS = "pending_area_reads"
        private val recentMessages = mutableMapOf<String, Long>()
        fun pendingAreaReads(context: Context): List<Int> {
            val saved = context.getSharedPreferences("watch_companion", 0).getString(PENDING_READS, "[]")
            val array = runCatching { JSONArray(saved) }.getOrDefault(JSONArray())
            return (0 until array.length()).mapNotNull { index -> array.optInt(index).takeIf { it > 0 } }
        }
        fun confirmAreaRead(context: Context, areaId: Int) {
            val remaining = JSONArray()
            pendingAreaReads(context).filter { it != areaId }.forEach(remaining::put)
            context.getSharedPreferences("watch_companion", 0).edit().putString(PENDING_READS, remaining.toString()).apply()
        }
        private fun isDuplicate(event: MessageEvent): Boolean {
            if (event.path !in setOf("/daf/watch/area-opened", "/daf/watch/open")) return false
            val now = android.os.SystemClock.elapsedRealtime()
            val key = "${event.path}:${event.sourceNodeId}:${event.data.contentHashCode()}"
            return synchronized(recentMessages) {
                recentMessages.entries.removeAll { now - it.value > 5_000 }
                if (recentMessages.containsKey(key)) true else {
                    recentMessages[key] = now
                    false
                }
            }
        }
        fun receive(context: Context, event: MessageEvent) {
            if (isDuplicate(event)) return
            when (event.path) {
                "/daf/watch/request" -> {
                    context.getSharedPreferences("watch_companion", 0).getString("snapshot", null)?.let {
                        Wearable.getMessageClient(context).sendMessage(event.sourceNodeId, "/daf/watch/state", it.toByteArray())
                    }
                    requestCurrentState?.invoke()
                }
                "/daf/watch/ping" -> if (event.data.size <= 64) {
                    Wearable.getMessageClient(context).sendMessage(event.sourceNodeId, "/daf/watch/pong", event.data)
                }
                "/daf/watch/area-opened" -> if (event.data.size <= 32) {
                    val areaId = event.data.toString(Charsets.UTF_8).toIntOrNull()
                    if (areaId != null && areaId > 0) {
                        val reads = pendingAreaReads(context).toMutableSet()
                        reads.add(areaId)
                        val array = JSONArray()
                        reads.forEach(array::put)
                        context.getSharedPreferences("watch_companion", 0).edit().putString(PENDING_READS, array.toString()).apply()
                        areaOpened?.invoke(areaId)
                    }
                }
                "/daf/watch/open" -> if (event.data.size <= 512) {
                    val request = runCatching { JSONObject(event.data.toString(Charsets.UTF_8)) }.getOrNull()
                    val requestId = request?.optString("requestId")?.takeIf { it.length in 1..80 } ?: return
                    val target = request.optString("target")
                    val uri = when (target) {
                        "area-change" -> {
                            val areaId = request.optInt("areaId")
                            val changeId = request.optInt("changeId")
                            if (areaId > 0 && changeId > 0) Uri.parse("driversagainstflock:///areas/$areaId/change?changeId=$changeId") else null
                        }
                        "areas" -> Uri.parse("driversagainstflock:///areas")
                        "scorecard" -> {
                            val driveId = request.optString("driveId").takeIf { it.matches(Regex("[A-Za-z0-9_-]{1,80}")) }
                            driveId?.let { Uri.parse("driversagainstflock:///scorecard/drive/$it") }
                        }
                        else -> null
                    }
                    if (uri == null) { acknowledge(context, event.sourceNodeId, requestId, "invalid"); return }
                    val opened = runCatching {
                        context.startActivity(Intent(Intent.ACTION_VIEW, uri).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }.isSuccess
                    acknowledge(context, event.sourceNodeId, requestId, if (opened) "opened" else "failed")
                }
            }
        }
        private fun acknowledge(context: Context, nodeId: String, requestId: String, status: String) {
            val response = JSONObject().put("requestId", requestId).put("status", status)
            Wearable.getMessageClient(context).sendMessage(nodeId, "/daf/watch/open-ack", response.toString().toByteArray())
        }
    }
    override fun onMessageReceived(event: MessageEvent) {
        receive(this, event)
    }
}
