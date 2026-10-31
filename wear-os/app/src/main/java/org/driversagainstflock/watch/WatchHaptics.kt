package org.driversagainstflock.watch

import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import org.json.JSONObject

data class WatchCue(
    val id: String,
    val pattern: String,
    val issuedAt: Long,
    val expiresAt: Long,
    val publisherId: String?,
    val sessionId: String?,
    val maneuverId: String?,
    val cameraId: String?,
    val preview: Boolean,
) {
    companion object {
        fun parse(payload: String): WatchCue {
            require(payload.toByteArray().size <= 2048)
            val json = JSONObject(payload)
            require(json.getInt("version") == 1)
            val id = json.getString("id")
            val pattern = json.getString("pattern")
            val issuedAt = json.getLong("issuedAt")
            val expiresAt = json.getLong("expiresAt")
            require(id.length in 1..240 && pattern in setOf("left", "right", "neutral", "camera"))
            require(issuedAt > 0 && expiresAt > issuedAt && expiresAt - issuedAt <= 5_000)
            val preview = json.optBoolean("preview", false)
            if (!preview && pattern != "camera") {
                require(!json.optionalString("publisherId").isNullOrEmpty())
                require(!json.optionalString("sessionId").isNullOrEmpty())
                require(!json.optionalString("maneuverId").isNullOrEmpty())
            }
            if (!preview && pattern == "camera") {
                require(!json.optionalString("publisherId").isNullOrEmpty())
                require(!json.optionalString("cameraId").isNullOrEmpty())
            }
            return WatchCue(id, pattern, issuedAt, expiresAt,
                json.optionalString("publisherId"), json.optionalString("sessionId"), json.optionalString("maneuverId"),
                json.optionalString("cameraId"), preview)
        }
    }

    fun eligible(snapshot: WatchSnapshot?, now: Long): Boolean {
        if (now < issuedAt - 5_000 || now >= expiresAt) return false
        if (preview) return true
        if (pattern == "camera") {
            val alert = snapshot?.cameraAlert ?: return false
            val sourceAt = alert.optionalLong("sourceAt") ?: return false
            return snapshot.cameraAlertsEnabled && publisherId == snapshot.publisherId &&
                cameraId == alert.optString("id") && now - sourceAt in -5_000 until STALE_AFTER_MS
        }
        val nav = snapshot?.navigation ?: return false
        return snapshot.hapticsEnabled && !snapshot.stale(now) && nav.optString("status") == "active" &&
            publisherId == snapshot.publisherId && sessionId == snapshot.sessionId &&
            maneuverId == nav.optJSONObject("maneuver")?.optString("id")
    }
}

class WatchHaptics(private val context: Context) {
    private val vibrator: Vibrator = if (Build.VERSION.SDK_INT >= 31) {
        context.getSystemService(VibratorManager::class.java).defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }

    fun suppressionReason(): String? {
        if (!vibrator.hasVibrator()) return "Haptics unavailable"
        if (Settings.System.getInt(context.contentResolver, Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) == 0)
            return "System haptics off"
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL)
            return "System interruption settings"
        return null
    }

    fun play(pattern: String): String? {
        suppressionReason()?.let { return it }
        val timings = when (pattern) {
            "left" -> longArrayOf(0, 85)
            "right" -> longArrayOf(0, 85, 110, 85)
            "neutral" -> longArrayOf(0, 250)
            "camera" -> longArrayOf(0, 60, 70, 60, 70, 60)
            else -> return "Unsupported pattern"
        }
        vibrator.vibrate(VibrationEffect.createWaveform(timings, -1))
        return null
    }
}
