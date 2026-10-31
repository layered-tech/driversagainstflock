package expo.modules.watchcompanion

import android.content.Context
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class WatchCompanionModule : Module() {
    private var messageListener: MessageClient.OnMessageReceivedListener? = null
    private var listenerContext: Context? = null
    private fun ensureMessageListener(context: Context) {
        if (messageListener != null) return
        val listener = MessageClient.OnMessageReceivedListener { event ->
            WatchCompanionService.receive(context, event)
        }
        messageListener = listener
        listenerContext = context
        Wearable.getMessageClient(context).addListener(listener)
    }
    override fun definition() = ModuleDefinition {
        Name("WatchCompanion")
        Events("onStateRequested", "onAreaOpened")
        OnCreate {
            WatchCompanionService.requestCurrentState = { sendEvent("onStateRequested", emptyMap<String, Any>()) }
            WatchCompanionService.areaOpened = { areaId -> sendEvent("onAreaOpened", mapOf("areaId" to areaId)) }
            appContext.reactContext?.let(::ensureMessageListener)
        }
        OnDestroy {
            listenerContext?.let { context ->
                messageListener?.let { Wearable.getMessageClient(context).removeListener(it) }
            }
            messageListener = null
            listenerContext = null
            WatchCompanionService.requestCurrentState = null
            WatchCompanionService.areaOpened = null
        }
        AsyncFunction("pendingAreaReads") {
            val context = appContext.reactContext ?: return@AsyncFunction emptyList<Int>()
            WatchCompanionService.pendingAreaReads(context)
        }
        AsyncFunction("confirmAreaRead") { areaId: Int ->
            val context = appContext.reactContext ?: return@AsyncFunction
            WatchCompanionService.confirmAreaRead(context, areaId)
        }
        AsyncFunction("hasConnectedWatch") { promise: Promise ->
            val context = appContext.reactContext ?: run {
                promise.resolve(false)
                return@AsyncFunction
            }
            Wearable.getNodeClient(context).connectedNodes
                .addOnSuccessListener { nodes -> promise.resolve(nodes.isNotEmpty()) }
                .addOnFailureListener { promise.resolve(false) }
        }
        AsyncFunction("publishSnapshot") { payload: String, promise: Promise ->
            val context = appContext.reactContext ?: run {
                promise.reject("NO_CONTEXT", "Phone runtime unavailable", null)
                return@AsyncFunction
            }
            val parsed = JSONObject(payload)
            require(parsed.getInt("protocolVersion") == 1 && payload.toByteArray().size <= 65536)
            ensureMessageListener(context)
            context.getSharedPreferences("watch_companion", 0).edit().putString("snapshot", payload).apply()
            val request = PutDataMapRequest.create("/daf/watch/state")
            request.dataMap.putString("snapshot", payload)
            Wearable.getDataClient(context).putDataItem(request.asPutDataRequest().setUrgent())
                .addOnSuccessListener { promise.resolve(null) }
                .addOnFailureListener { promise.reject("PUBLISH_FAILED", "Watch state delivery failed", it) }
        }
        AsyncFunction("sendHapticCue") { payload: String, promise: Promise ->
            val context = appContext.reactContext ?: run {
                promise.reject("NO_CONTEXT", "Phone runtime unavailable", null)
                return@AsyncFunction
            }
            val cue = JSONObject(payload)
            require(payload.toByteArray().size <= 2048 && cue.getInt("version") == 1)
            require(cue.getString("pattern") in setOf("left", "right", "neutral", "camera"))
            require(cue.getLong("expiresAt") > cue.getLong("issuedAt"))
            Wearable.getNodeClient(context).connectedNodes
                .addOnSuccessListener { nodes ->
                    if (nodes.isEmpty()) {
                        promise.reject("NO_WATCH", "No connected watch", null)
                        return@addOnSuccessListener
                    }
                    val deliveries = nodes.map { node ->
                        Wearable.getMessageClient(context).sendMessage(node.id, "/daf/watch/haptic-cue", payload.toByteArray())
                    }
                    com.google.android.gms.tasks.Tasks.whenAll(deliveries)
                        .addOnSuccessListener { promise.resolve(null) }
                        .addOnFailureListener { promise.reject("CUE_FAILED", "Watch cue delivery failed", it) }
                }
                .addOnFailureListener { promise.reject("NODE_FAILED", "Watch connection unavailable", it) }
        }
        AsyncFunction("openHapticsOnWatch") { promise: Promise ->
            val context = appContext.reactContext ?: run {
                promise.reject("NO_CONTEXT", "Phone runtime unavailable", null)
                return@AsyncFunction
            }
            Wearable.getNodeClient(context).connectedNodes
                .addOnSuccessListener { nodes ->
                    if (nodes.isEmpty()) {
                        promise.reject("NO_WATCH", "No connected watch", null)
                        return@addOnSuccessListener
                    }
                    val deliveries = nodes.map { node ->
                        Wearable.getMessageClient(context).sendMessage(node.id, "/daf/watch/open-haptics", byteArrayOf())
                    }
                    com.google.android.gms.tasks.Tasks.whenAll(deliveries)
                        .addOnSuccessListener { promise.resolve(null) }
                        .addOnFailureListener { promise.reject("OPEN_FAILED", "Watch screen could not open", it) }
                }
                .addOnFailureListener { promise.reject("NODE_FAILED", "Watch connection unavailable", it) }
        }
    }
}
