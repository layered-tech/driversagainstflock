package org.driversagainstflock.watch

import android.os.Bundle
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import androidx.wear.ambient.AmbientModeSupport
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

class MainActivity : FragmentActivity(), AmbientModeSupport.AmbientCallbackProvider {
    private var requestedNotifications = false
    private var resumed by mutableStateOf(false)
    private var resumeRevision by mutableStateOf(0)
    private var ambient by mutableStateOf(false)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AmbientModeSupport.attach(this)
        val repository = WatchRepository.get(this)
        setContent {
            LaunchedEffect(repository.snapshot?.sessionId, resumed) {
                if (resumed && !requestedNotifications && repository.snapshot?.sessionId != null && Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestedNotifications = true
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_PERMISSION_REQUEST)
                }
            }
            WatchApp(repository, ambient, resumed, resumeRevision)
        }
    }
    override fun onResume() {
        super.onResume()
        resumed = true
        resumeRevision += 1
        WatchRepository.get(this).refresh(request = true)
    }
    override fun onPause() { resumed = false; super.onPause() }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            WatchRepository.get(this).refreshOngoingActivity()
        }
    }
    override fun getAmbientCallback() = object : AmbientModeSupport.AmbientCallback() {
        override fun onEnterAmbient(details: Bundle?) { ambient = true }
        override fun onExitAmbient() { ambient = false; resumeRevision += 1; WatchRepository.get(this@MainActivity).refresh(request = true) }
    }
    companion object { private const val NOTIFICATION_PERMISSION_REQUEST = 41 }
}
