package org.driversagainstflock.tv

import android.content.Intent
import android.os.SystemClock
import android.view.KeyEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test

class TvRemoteNavigationTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    private fun contains(node: AccessibilityNodeInfo?, text: String): Boolean {
        if (node == null) return false
        if (node.text?.toString() == text || node.contentDescription?.toString() == text) return true
        return (0 until node.childCount).any { contains(node.getChild(it), text) }
    }

    private fun allText(node: AccessibilityNodeInfo?): List<String> = if (node == null) emptyList() else
        listOfNotNull(node.text?.toString()) + (0 until node.childCount).flatMap { allText(node.getChild(it)) }

    private fun visible(text: String): Boolean {
        if (android.os.Build.VERSION.SDK_INT >= 33) instrumentation.uiAutomation.clearCache()
        return contains(instrumentation.uiAutomation.rootInActiveWindow, text)
    }

    private fun awaitText(text: String) {
        val deadline = SystemClock.elapsedRealtime() + 5000
        while (!visible(text) && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(100)
        assertTrue("Expected visible text: $text; actual: ${allText(instrumentation.uiAutomation.rootInActiveWindow)}", visible(text))
        instrumentation.waitForIdleSync()
    }

    private fun press(key: Int) {
        instrumentation.sendKeyDownUpSync(key)
        instrumentation.waitForIdleSync()
        SystemClock.sleep(200)
    }

    private fun textBounds(node: AccessibilityNodeInfo?, text: String): List<android.graphics.Rect> {
        if (node == null) return emptyList()
        val own = if (node.text?.toString() == text) listOf(android.graphics.Rect().also { node.getBoundsInScreen(it) }) else emptyList()
        return own + (0 until node.childCount).flatMap { textBounds(node.getChild(it), text) }
    }

    @Test fun homeFootersStayVisibleAndAreaFocusChangesTheFeed() {
        val context = instrumentation.targetContext
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            .putExtra("designPreview", true).putExtra("screen", "Home"))
        try {
            awaitText("THIS WEEK IN OAKLAND")
            for (label in listOf("Instant", "Daily", "Weekly")) {
                val bounds = textBounds(instrumentation.uiAutomation.rootInActiveWindow, label)
                assertTrue("$label must have an unclipped footer", bounds.any { it.height() > 10 && it.top > 0 && it.bottom < 1080 })
            }
            assertEquals(3, textBounds(instrumentation.uiAutomation.rootInActiveWindow, "8 weeks").count { it.height() > 10 })
            val root = instrumentation.uiAutomation.rootInActiveWindow
            val daily = textBounds(root, "Daily").single()
            val weekly = textBounds(root, "Weekly").single()
            assertTrue("Count and quiet card footers must align", kotlin.math.abs(daily.top - weekly.top) <= 2)

            press(KeyEvent.KEYCODE_DPAD_RIGHT)
            awaitText("THIS WEEK IN AROUND HOME")
            press(KeyEvent.KEYCODE_DPAD_RIGHT)
            awaitText("THIS WEEK IN FRUITVALE")
            press(KeyEvent.KEYCODE_DPAD_LEFT)
            awaitText("THIS WEEK IN AROUND HOME")
        } finally {
            instrumentation.runOnMainSync { activity.finish() }
        }
    }

    @Test fun remoteOpensAreasFeedCameraAndReturnsToItsOrigin() {
        val context = instrumentation.targetContext
        val preferences = context.getSharedPreferences("tv_display", 0)
        val previousHidden = preferences.getStringSet("hiddenFeedIds", emptySet()).orEmpty().toSet()
        preferences.edit().remove("hiddenFeedIds").commit()
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            .putExtra("designPreview", true).putExtra("screen", "Home"))
        try {
            awaitText("YOUR AREAS")
            press(KeyEvent.KEYCODE_DPAD_CENTER)
            val sessionField = MainActivity::class.java.getDeclaredField("session").apply { isAccessible = true }
            assertEquals("Remote OK should update navigation state", TvScreen.AreaFeed, (sessionField.get(activity) as TvSession).screen)
            awaitText("Moving down the list moves the map. OK opens the camera.")
            press(KeyEvent.KEYCODE_DPAD_CENTER)
            awaitText("Back to the feed")
            assertFalse(visible("Preview route"))
            press(KeyEvent.KEYCODE_DPAD_CENTER)
            awaitText("Moving down the list moves the map. OK opens the camera.")
            assertTrue(visible("Grand Ave & Lake Park Blvd"))
            press(KeyEvent.KEYCODE_BACK)
            awaitText("YOUR AREAS")
            instrumentation.runOnMainSync { (sessionField.get(activity) as TvSession).navigate(TvScreen.Areas) }
            awaitText("My areas")
            press(KeyEvent.KEYCODE_DPAD_DOWN)
            press(KeyEvent.KEYCODE_DPAD_CENTER)
            awaitText("Moving down the list moves the map. OK opens the camera.")
            assertEquals(TvScreen.AreaFeed, (sessionField.get(activity) as TvSession).screen)
            press(KeyEvent.KEYCODE_BACK)
            awaitText("My areas")
            press(KeyEvent.KEYCODE_BACK)
            awaitText("YOUR AREAS")
            val session = sessionField.get(activity) as TvSession
            instrumentation.runOnMainSync { session.navigate(TvScreen.Ambient) }
            awaitText("Press any button to wake up.")
            press(KeyEvent.KEYCODE_DPAD_CENTER)
            awaitText("YOUR AREAS")
            assertEquals("The wake key must not open the focused card", TvScreen.Home, session.screen)
        } finally {
            instrumentation.runOnMainSync { activity.finish() }
            preferences.edit().putStringSet("hiddenFeedIds", previousHidden).commit()
        }
    }
}
