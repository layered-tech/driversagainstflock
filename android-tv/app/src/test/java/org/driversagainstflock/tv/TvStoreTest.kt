package org.driversagainstflock.tv

import org.junit.Assert.*
import org.junit.Test

class TvStoreTest {
    private val camera = TvCamera("1", -122.2, 37.8, "Grand Ave")
    private val area = TvArea(1, "Oakland", "", 10, 1, 0, "Instant", listOf(camera))

    @Test fun hidingOnlyAffectsTheFeedAndCanBeRestored() {
        val store = TvStore()
        var persisted = emptySet<String>()
        store.persistHiddenFeed = { persisted = it }
        store.acceptAreas(listOf(area), 1000L)
        assertEquals(camera, store.selected)
        store.hideFromFeed(camera)
        assertTrue(store.visibleChanges(area).isEmpty())
        assertNull(store.selected)
        assertEquals(setOf("1"), persisted)
        assertEquals(listOf(camera), store.area!!.changes)
        assertEquals(10, store.area!!.cameraCount)
        store.restoreHiddenFeed()
        assertEquals(listOf(camera), store.visibleChanges(area))
        assertTrue(persisted.isEmpty())
    }

    @Test fun syncingKeepsTheSelectedAreaAndReportsActualFreshness() {
        val store = TvStore()
        val other = area.copy(id = 2, name = "Other area")
        store.acceptAreas(listOf(area, other), 1000L)
        store.areaIndex = 1
        store.acceptAreas(listOf(other, area), 2000L)
        assertEquals(2L, store.area!!.id)
        assertEquals("Synced just now", store.syncLabel(2001L))
        assertEquals("Synced from your phone 2 min ago", store.syncLabel(122000L))
    }

    @Test fun firstSyncHighlightsTheAreaWithNewOrRemovedAlprs() {
        val store = TvStore()
        val quiet = area.copy(id = 2, name = "Quiet", added = 0, changes = emptyList())
        store.acceptAreas(listOf(quiet, area), 1000L)
        assertEquals(1L, store.area!!.id)
        assertEquals(camera, store.selected)
    }

    @Test fun overlappingAreasCountEachChangeOnceAndIncompleteFeedsStayUnknown() {
        val store = TvStore()
        store.acceptAreas(listOf(area, area.copy(id = 2)), 0)
        assertEquals(1, store.householdChangeCount())
        store.acceptAreas(listOf(area.copy(added = 10)), 0)
        assertNull(store.householdChangeCount())
        store.acceptAreas(listOf(area.copy(feedAvailable = false)), 0)
        assertNull(store.householdChangeCount())
    }

    @Test fun focusingAnAreaUpdatesItsFeedAndMapSelection() {
        val store = TvStore()
        val otherCamera = camera.copy(id = "2", street = "Other street")
        val other = area.copy(id = 2, changes = listOf(otherCamera))
        val quiet = area.copy(id = 3, added = 0, changes = emptyList())
        store.acceptAreas(listOf(area, other, quiet), 1000L)
        store.selectArea(1)
        assertEquals(other, store.area)
        assertEquals(listOf(otherCamera), store.visibleChanges(store.area!!))
        assertEquals(otherCamera, store.selected)
        store.selectArea(2)
        assertEquals(quiet, store.area)
        assertNull(store.selected)
        store.selectArea(99)
        assertEquals(quiet, store.area)
    }

    @Test fun unpairingClearsHouseholdDataAndHiddenFeedPreferences() {
        val store = TvStore()
        store.paired = true
        store.acceptAreas(listOf(area), 1000L)
        store.hideFromFeed(camera)
        store.clearHousehold()
        assertFalse(store.paired)
        assertTrue(store.areas.isEmpty())
        assertTrue(store.hiddenFeedIds.isEmpty())
        assertEquals("Phone not paired", store.syncLabel())
    }
}
