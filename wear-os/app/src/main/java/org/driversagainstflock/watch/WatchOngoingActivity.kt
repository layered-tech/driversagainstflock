package org.driversagainstflock.watch

import android.Manifest
import android.app.NotificationChannel
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.wear.ongoing.OngoingActivity

class WatchOngoingActivity(private val context: Context) {
    private val manager = context.getSystemService(NotificationManager::class.java)
    private var activeSessionId: String? = null

    fun update(snapshot: WatchSnapshot) {
        val nav = snapshot.navigation
        val sessionId = snapshot.sessionId?.takeIf { nav.optString("status") != "idle" }
        if (sessionId == null) {
            activeSessionId = null
            manager.cancel(NOTIFICATION_ID)
            return
        }
        if (activeSessionId == sessionId && manager.areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        if (!manager.areNotificationsEnabled()) return

        manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Active guidance", NotificationManager.IMPORTANCE_LOW))
        val returnIntent = PendingIntent.getActivity(context, 0,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle("Navigation active")
            .setContentText("Tap to return to guidance")
            .setSmallIcon(R.drawable.maneuver_straight)
            .setContentIntent(returnIntent)
            .setCategory(Notification.CATEGORY_NAVIGATION)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
        OngoingActivity.Builder(context, NOTIFICATION_ID, builder)
            .setStaticIcon(R.drawable.maneuver_straight)
            .setTouchIntent(returnIntent)
            .build()
            .apply(context)
        manager.notify(NOTIFICATION_ID, builder.build())
        activeSessionId = sessionId
    }

    companion object {
        private const val CHANNEL_ID = "active_guidance"
        private const val NOTIFICATION_ID = 41
    }
}
