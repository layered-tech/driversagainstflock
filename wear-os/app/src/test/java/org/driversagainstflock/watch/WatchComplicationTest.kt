package org.driversagainstflock.watch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONObject
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.NoDataComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData

class WatchComplicationTest {
    private fun payload(): JSONObject = JSONObject(javaClass.classLoader!!.getResource("active.json")!!.readText())

    @Test fun idleComplicationsUseTheCurrentScoreInsteadOfTheLastRecap() {
        val json = payload().put("currentPrivacyScore", 65)
            .put("recap", JSONObject().put("status", "none").put("privacyScore", 82))
        assertEquals(82, quickAccess(WatchSnapshot.parse(json.toString()), 3000, true).score)
        json.getJSONObject("navigation").put("status", "idle").put("sessionId", JSONObject.NULL).put("maneuver", JSONObject.NULL)
        assertEquals(65, quickAccess(WatchSnapshot.parse(json.toString()), 3000, true).score)
        json.put("currentPrivacyScore", 0)
        assertEquals(0, quickAccess(WatchSnapshot.parse(json.toString()), 3000, true).score)
        json.put("currentPrivacyScore", JSONObject.NULL)
        assertNull(quickAccess(WatchSnapshot.parse(json.toString()), 3000, true).score)
        json.remove("currentPrivacyScore")
        assertNull(quickAccess(WatchSnapshot.parse(json.toString()), 3000, true).score)
    }

    @Test fun currentScoreContractRejectsInvalidNumbersAndAcceptsOlderPayloads() {
        assertNull(WatchSnapshot.parse(payload().toString()).currentPrivacyScore)
        for (value in listOf(-1, 101, 0.5, "82")) {
            assertTrue(runCatching { WatchSnapshot.parse(payload().put("currentPrivacyScore", value).toString()) }.isFailure)
        }
    }

    @Test fun privacyScoreSupportsGaugeAndTextAndExplicitlyClearsMissingScores() {
        for (type in listOf(ComplicationType.RANGED_VALUE, ComplicationType.SHORT_TEXT)) {
            for (score in listOf(0, 82, 100)) {
                val data = privacyScoreData(type, score)!!
                data.validate()
                assertEquals(type, data.type)
                if (data is ShortTextComplicationData) assertNotNull(data.text)
            }
            assertTrue(privacyScoreData(type, null) is NoDataComplicationData)
        }
        assertNull(privacyScoreData(ComplicationType.LONG_TEXT, 82))
        assertNull(privacyScoreData(ComplicationType.MONOCHROMATIC_IMAGE, 82))
    }

    @Test fun areaChangesSupportOnlyTheCountAndSummaryFormats() {
        for (unread in listOf(null, 0, 4)) {
            val state = QuickAccess("areas", "", "", unread, "Oakland", 82)
            for (type in listOf(ComplicationType.SHORT_TEXT, ComplicationType.LONG_TEXT)) {
                val data = areaChangesComplication(type, state)!!
                data.validate()
                assertEquals(type, data.type)
            }
            assertNull(areaChangesComplication(ComplicationType.RANGED_VALUE, state))
            assertNull(areaChangesComplication(ComplicationType.MONOCHROMATIC_IMAGE, state))
        }
    }

    @Test fun privacyScoresPassTheSameValidationUsedByTheDataSourceService() {
        for (score in listOf(0, 82, 100)) {
            val data = privacyScoreComplication(score)
            data.validate()
            assertEquals(score.toFloat(), data.value, 0f)
            assertEquals(0f, data.min, 0f)
            assertEquals(100f, data.max, 0f)
            assertNotNull(data.text)
        }
    }
}
