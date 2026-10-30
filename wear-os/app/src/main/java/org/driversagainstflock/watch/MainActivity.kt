package org.driversagainstflock.watch

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import androidx.wear.ambient.AmbientModeSupport
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

class MainActivity : FragmentActivity(), AmbientModeSupport.AmbientCallbackProvider {
    private var resumed by mutableStateOf(false)
    private var resumeRevision by mutableStateOf(0)
    private var ambient by mutableStateOf(false)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AmbientModeSupport.attach(this)
        setContent { WatchApp(WatchRepository.get(this), ambient, resumed, resumeRevision) }
    }
    override fun onResume() {
        super.onResume()
        resumed = true
        resumeRevision += 1
        WatchRepository.get(this).refresh(request = true)
    }
    override fun onPause() { resumed = false; super.onPause() }
    override fun getAmbientCallback() = object : AmbientModeSupport.AmbientCallback() {
        override fun onEnterAmbient(details: Bundle?) { ambient = true }
        override fun onExitAmbient() { ambient = false; resumeRevision += 1; WatchRepository.get(this@MainActivity).refresh(request = true) }
    }
}
