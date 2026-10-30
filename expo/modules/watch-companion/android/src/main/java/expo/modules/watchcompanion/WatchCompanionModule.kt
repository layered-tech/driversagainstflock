package expo.modules.watchcompanion

import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class WatchCompanionModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("WatchCompanion")
        Events("onStateRequested")
        OnCreate { WatchCompanionService.requestCurrentState = { sendEvent("onStateRequested", emptyMap<String, Any>()) } }
        OnDestroy { WatchCompanionService.requestCurrentState = null }
        AsyncFunction("publishSnapshot") { payload: String, promise: Promise ->
            val context = appContext.reactContext ?: run {
                promise.reject("NO_CONTEXT", "Phone runtime unavailable", null)
                return@AsyncFunction
            }
            val parsed = JSONObject(payload)
            require(parsed.getInt("protocolVersion") == 1 && payload.toByteArray().size <= 65536)
            context.getSharedPreferences("watch_companion", 0).edit().putString("snapshot", payload).apply()
            val request = PutDataMapRequest.create("/daf/watch/state")
            request.dataMap.putString("snapshot", payload)
            Wearable.getDataClient(context).putDataItem(request.asPutDataRequest().setUrgent())
                .addOnSuccessListener { promise.resolve(null) }
                .addOnFailureListener { promise.reject("PUBLISH_FAILED", "Watch state delivery failed", it) }
        }
    }
}
