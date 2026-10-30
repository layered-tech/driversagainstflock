package expo.modules.watchcompanion

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService

class WatchCompanionService : WearableListenerService() {
    companion object { @Volatile var requestCurrentState: (() -> Unit)? = null }
    override fun onMessageReceived(event: MessageEvent) {
        when (event.path) {
            "/daf/watch/request" -> {
                // Cached data retains its original source time, even after process death.
                getSharedPreferences("watch_companion", 0).getString("snapshot", null)?.let {
                    Wearable.getMessageClient(this).sendMessage(event.sourceNodeId, "/daf/watch/state", it.toByteArray())
                }
                requestCurrentState?.invoke()
            }
            "/daf/watch/ping" -> if (event.data.size <= 64) {
                Wearable.getMessageClient(this).sendMessage(event.sourceNodeId, "/daf/watch/pong", event.data)
            }
        }
    }
}
