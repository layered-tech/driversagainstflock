package org.driversagainstflock.watch

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

class WatchListenerService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        events.forEach { event ->
            if (event.type == DataEvent.TYPE_CHANGED && event.dataItem.uri.path == "/daf/watch/state") {
                DataMapItem.fromDataItem(event.dataItem).dataMap.getString("snapshot")?.let { WatchRepository.get(this).accept(it) }
            }
        }
    }
    override fun onMessageReceived(event: MessageEvent) {
        when (event.path) {
            "/daf/watch/state" -> if (event.data.size <= 65_536) WatchRepository.get(this).accept(event.data.toString(Charsets.UTF_8))
            "/daf/watch/pong" -> WatchRepository.get(this).pong(event.sourceNodeId, event.data)
        }
    }
}
