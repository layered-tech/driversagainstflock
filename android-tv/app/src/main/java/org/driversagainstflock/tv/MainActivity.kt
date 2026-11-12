package org.driversagainstflock.tv

import android.os.Bundle
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.OnBackPressedCallback
import android.view.KeyEvent
import org.json.JSONObject
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private val session = TvSession(SystemClock::elapsedRealtime)
    private var localServer: TvLocalServer? = null
    private var pairingProtocol: TvPairingProtocol? = null
    private val store = TvStore()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (!session.back()) finish()
            }
        })
        val displayPreferences = getSharedPreferences("tv_display", MODE_PRIVATE)
        store.darkTheme = displayPreferences.getBoolean("darkTheme", true)
        store.changeTheme = { dark ->
            store.darkTheme = dark
            displayPreferences.edit().putBoolean("darkTheme", dark).apply()
        }
        store.hiddenFeedIds = displayPreferences.getStringSet("hiddenFeedIds", emptySet()).orEmpty().toSet()
        store.persistHiddenFeed = { ids -> displayPreferences.edit().putStringSet("hiddenFeedIds", ids).apply() }
        if (BuildConfig.DEBUG && intent.getBooleanExtra("designPreview", false)) {
            store.darkTheme = intent.getStringExtra("theme") != "light"
            store.loadPreview(assets.open("design-preview.json").bufferedReader().use { it.readText() })
            session.restore(paired = true)
            val previewScreen = TvScreen.valueOf(intent.getStringExtra("screen") ?: "Home")
            if (previewScreen != TvScreen.Home) session.navigate(previewScreen)
        }
        if (!store.preview) startPairing()
        setContent { TvApp(session, store) }
    }

    private fun startPairing() {
        val preferences = getSharedPreferences("tv_household", MODE_PRIVATE)
        val restoredHash = preferences.getString("tokenHash", null)
        session.restore(restoredHash != null)
        if (restoredHash != null) {
            try {
                preferences.getString("snapshot", null)?.let { raw ->
                    val json = JSONObject(raw)
                    store.acceptAreas(TvSnapshot.areas(json), json.optLong("receivedAt"))
                }
            } catch (_: Exception) { preferences.edit().remove("snapshot").apply() }
        }
        val protocol = TvPairingProtocol(SystemClock::elapsedRealtime, { session.pairingCode }, { session.pairingExpiresAt },
            initialTokenHash = restoredHash,
            persistTokenHash = { hash ->
                preferences.edit().apply { if (hash == null) remove("tokenHash") else putString("tokenHash", hash) }.apply()
                runOnUiThread { store.paired = hash != null }
            },
            receiveSnapshot = { json ->
                val areas = TvSnapshot.areas(json)
                val receivedAt = System.currentTimeMillis()
                preferences.edit().putString("snapshot", TvSnapshot.encode(areas, receivedAt).toString()).apply()
                runOnUiThread {
                    store.acceptAreas(areas, receivedAt)
                    if (session.screen == TvScreen.Pairing) session.completePairing()
                    }
            }, onUnpair = {
                preferences.edit().remove("snapshot").apply()
                runOnUiThread { store.clearHousehold(); session.restore(paired = false) }
            })
        pairingProtocol = protocol
        store.paired = protocol.paired
        store.unpair = { protocol.reset() }
        lifecycleScope.launch {
            try {
                val server = withContext(Dispatchers.IO) { TvLocalServer(this@MainActivity, protocol).also { localServer = it; it.start() } }
                val address = server.address()
                store.pairingUri = address?.let { "daf-tv://pair?host=$it&port=${server.port}&fingerprint=${server.fingerprint}" }
                store.pairingStatus = if (address == null) "Connect your TV to home Wi-Fi" else "Waiting for your phone…"
            } catch (_: Exception) { localServer?.close(); store.pairingStatus = "Local pairing unavailable. Restart the app to retry." }
        }
    }

    override fun onDestroy() {
        localServer?.close()
        super.onDestroy()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            val woke = session.interact()
            if (woke) return true
        }
        return super.dispatchKeyEvent(event)
    }
}
