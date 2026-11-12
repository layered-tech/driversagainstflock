package org.driversagainstflock.tv

import androidx.compose.runtime.*
import org.json.JSONObject

class TvStore {
    var darkTheme by mutableStateOf(true)
    var changeTheme: (Boolean) -> Unit = { darkTheme = it }
    var hiddenFeedIds by mutableStateOf<Set<String>>(emptySet())
    var persistHiddenFeed: (Set<String>) -> Unit = {}
    fun visibleChanges(area: TvArea) = area.changes.filter { it.kind in setOf("added", "removed") && it.id !in hiddenFeedIds }
    fun hideFromFeed(camera: TvCamera) {
        hiddenFeedIds = hiddenFeedIds + camera.id
        persistHiddenFeed(hiddenFeedIds)
        if (selected?.id == camera.id) selected = area?.let(::visibleChanges)?.firstOrNull()
        notice = "Hidden from this TV's feed"
    }
    fun restoreHiddenFeed() {
        hiddenFeedIds = emptySet()
        persistHiddenFeed(hiddenFeedIds)
    }

    fun syncLabel(now: Long = System.currentTimeMillis()): String {
        if (preview) return "Synced 2 min ago"
        if (syncedAt == 0L) return if (paired) "Waiting for phone sync" else "Phone not paired"
        val minutes = ((now - syncedAt).coerceAtLeast(0) / 60_000)
        return if (minutes == 0L) "Synced just now" else "Synced from your phone $minutes min ago"
    }
    var syncedAt by mutableLongStateOf(0L)
    fun acceptAreas(items: List<TvArea>, receivedAt: Long) {
        val selectedId = area?.id
        val selectedChangeId = selected?.id
        areas = items
        val previousIndex = items.indexOfFirst { it.id == selectedId }
        areaIndex = if (previousIndex >= 0) previousIndex else items.indices.maxByOrNull { items[it].added + items[it].removed } ?: 0
        selected = area?.let { selectedArea ->
            visibleChanges(selectedArea).firstOrNull { it.id == selectedChangeId }
                ?: visibleChanges(selectedArea).firstOrNull()
        }
        syncedAt = receivedAt
    }
    fun householdChangeCount(): Int? {
        if (areas.any { !it.feedAvailable || it.changes.count { change -> change.kind in setOf("added", "removed") } < it.added + it.removed }) return null
        return areas.flatMap { it.changes }.filter { it.kind in setOf("added", "removed") }.distinctBy { it.id }.size
    }

    fun selectArea(index: Int) {
        if (index !in areas.indices || (index == areaIndex && selected != null)) return
        areaIndex = index
        selected = area?.let(::visibleChanges)?.firstOrNull()
    }

    fun clearHousehold() {
        areas = emptyList(); areaIndex = 0; syncedAt = 0
        paired = false; selected = null
        restoreHiddenFeed()
        notice = "Phone unpaired"
    }
    var pairingUri by mutableStateOf<String?>(null)
    var pairingStatus by mutableStateOf("Preparing local pairing…")
    var unpair: () -> Unit = {}
    var notice by mutableStateOf("")
    var selected by mutableStateOf<TvCamera?>(null)
    var areas by mutableStateOf<List<TvArea>>(emptyList())
    var areaIndex by mutableIntStateOf(0)
    var paired by mutableStateOf(false)
    var preview by mutableStateOf(false)
    val area get() = areas.getOrNull(areaIndex)

    fun loadPreview(json: String) {
        check(BuildConfig.DEBUG)
        val root = JSONObject(json)
        val array = root.getJSONArray("areas")
        areas = (0 until array.length()).map { index ->
            val item = array.getJSONObject(index)
            val changes = item.getJSONArray("changes")
            val mapped = item.optJSONArray("mappedCameras")
            TvArea(item.getLong("id"), item.getString("name"), item.getString("description"), item.getInt("cameraCount"), item.getInt("added"), item.getInt("removed"), item.getString("cadence"),
                (0 until changes.length()).map { c ->
                    val change = changes.getJSONObject(c)
                    TvCamera(change.getString("id"), change.getDouble("longitude"), change.getDouble("latitude"), change.getString("street"), change.getString("kind"), change.getString("detail"), change.optString("direction", "Unknown"), change.optString("model", "Unknown"), change.optString("verification"))
                }, kind = item.optString("kind"), mappedCameras = mapped?.let { cameras ->
                    (0 until cameras.length()).map { point ->
                        val position = cameras.getJSONObject(point)
                        TvMapPoint(position.getDouble("longitude"), position.getDouble("latitude"), position.optString("direction"))
                    }
                }.orEmpty(), weeklyChanges = item.optJSONArray("weeklyChanges")?.let { weeks -> (0 until weeks.length()).map { weeks.getInt(it) } }.orEmpty())
        }
        selected = area?.changes?.firstOrNull()
        paired = true
        preview = true
    }
}
