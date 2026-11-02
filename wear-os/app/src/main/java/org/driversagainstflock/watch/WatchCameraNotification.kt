package org.driversagainstflock.watch

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject

internal class WatchCameraNotification(private val context: Context) {
    private val manager = context.getSystemService(NotificationManager::class.java)
    private val channelId = "watch-camera-alerts"

    fun show(alert: JSONObject) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) !=
            android.content.pm.PackageManager.PERMISSION_GRANTED) return
        manager.createNotificationChannel(NotificationChannel(channelId, "Camera alerts", NotificationManager.IMPORTANCE_HIGH))
        val type = alert.optString("type", "Camera")
        val range = distance(alert.optionalDouble("distanceMeters"))
        val road = alert.optionalString("road")
        val summary = "$type in $range" + (road?.let { " · $it" } ?: "")
        val detail = "$range · $type" + (road?.let { " · $it" } ?: "")
        val intent = PendingIntent.getActivity(context, 73,
            Intent(context, MainActivity::class.java).putExtra("page", 0),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(context, channelId)
            .setSmallIcon(R.drawable.app_logo)
            .setContentTitle(if (alert.optInt("count") > 1) "${alert.optInt("count")} cameras ahead" else "Camera ahead")
            .setContentText(summary)
            .setStyle(Notification.BigTextStyle().bigText(detail))
            .setContentIntent(intent)
            .setAutoCancel(true)
            .setTimeoutAfter(30_000)
            .build()
        manager.notify(73, notification)
    }

    fun dismiss() = manager.cancel(73)
}
