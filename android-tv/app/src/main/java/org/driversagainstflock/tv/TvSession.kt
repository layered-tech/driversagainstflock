package org.driversagainstflock.tv

import java.security.SecureRandom
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

enum class TvScreen { Pairing, Home, Areas, AreaFeed, Camera, Ambient, Settings }

/** Navigation and expiry use a monotonic clock supplied by the host. */
class TvSession(private val clock: () -> Long) {
    var screen by mutableStateOf(TvScreen.Pairing)
        private set
    private val history = mutableListOf<TvScreen>()
    private var lastInteraction = clock()
    private var beforeAmbient = TvScreen.Home
    @Volatile var pairingCode = newCode()
        private set
    @Volatile var pairingExpiresAt = clock() + PAIRING_LIFETIME
        private set

    fun navigate(destination: TvScreen) {
        interact()
        if (destination == screen) return
        if (destination == TvScreen.Ambient) {
            beforeAmbient = screen
        } else {
            history.add(screen)
        }
        screen = destination
    }

    fun restore(paired: Boolean) {
        history.clear()
        screen = if (paired) TvScreen.Home else TvScreen.Pairing
        lastInteraction = clock()
    }

    fun completePairing() { restore(paired = true) }

    fun back(): Boolean {
        if (screen == TvScreen.Ambient) { interact(); return true }
        if (history.isEmpty()) return false
        screen = history.removeAt(history.lastIndex)
        interact()
        return true
    }

    fun interact(): Boolean {
        val woke = screen == TvScreen.Ambient
        if (woke) screen = beforeAmbient
        lastInteraction = clock()
        return woke
    }

    fun tick() {
        if (clock() >= pairingExpiresAt) {
            pairingCode = newCode()
            pairingExpiresAt = clock() + PAIRING_LIFETIME
        }
        if (screen != TvScreen.Pairing && screen != TvScreen.Ambient && clock() - lastInteraction >= IDLE_TIMEOUT) {
            beforeAmbient = screen
            screen = TvScreen.Ambient
        }
    }

    companion object {
        const val PAIRING_LIFETIME = 300_000L
        const val IDLE_TIMEOUT = 600_000L
        private val random = SecureRandom()
        private const val ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        private fun newCode() = (1..6).map { ALPHABET[random.nextInt(ALPHABET.length)] }.joinToString("")
    }
}
