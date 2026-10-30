package org.driversagainstflock.watch

import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class WatchTransportTest {
    @Test fun pairedPhoneProvidesStateAndAnswersPing() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("pairedPhone") == "true")
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val nodes = Tasks.await(Wearable.getNodeClient(context).connectedNodes, 10, TimeUnit.SECONDS)
        assertTrue("Pair a phone running the staging APK before this check", nodes.isNotEmpty())
        val client = Wearable.getMessageClient(context)
        val token = "transport-test-${System.nanoTime()}".toByteArray()
        val reply = CountDownLatch(1)
        val stateReply = CountDownLatch(1)
        val requestedSnapshot = AtomicReference<WatchSnapshot>()
        val listener = com.google.android.gms.wearable.MessageClient.OnMessageReceivedListener { event ->
            if (event.path == "/daf/watch/pong" && event.data.contentEquals(token)) reply.countDown()
            if (event.path == "/daf/watch/state") {
                requestedSnapshot.set(WatchSnapshot.parse(event.data.toString(Charsets.UTF_8)))
                stateReply.countDown()
            }
        }
        Tasks.await(client.addListener(listener), 10, TimeUnit.SECONDS)
        try {
            nodes.forEach { Tasks.await(client.sendMessage(it.id, "/daf/watch/ping", token), 10, TimeUnit.SECONDS) }
            assertTrue("Phone must answer the app-scoped ping", reply.await(10, TimeUnit.SECONDS))
            nodes.forEach { Tasks.await(client.sendMessage(it.id, "/daf/watch/request", byteArrayOf()), 10, TimeUnit.SECONDS) }
            assertTrue("Phone must answer a current-state request", stateReply.await(10, TimeUnit.SECONDS))
            assertEquals("staging", requestedSnapshot.get().json.getString("environment"))
            val repository = WatchRepository.get(context)
            InstrumentationRegistry.getInstrumentation().runOnMainSync { repository.refresh(request = true) }
            val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15)
            while (System.nanoTime() < deadline && (!repository.connected || repository.snapshot == null || !repository.pingStatus.endsWith(" ms"))) {
                Thread.sleep(100)
            }
            assertTrue("DAF companion must be confirmed, even when capability metadata is unavailable", repository.connected)
            assertNotNull("Phone must provide its current snapshot", repository.snapshot)
            assertTrue("Repository ping must complete: ${repository.pingStatus}", repository.pingStatus.endsWith(" ms"))
        } finally {
            Tasks.await(client.removeListener(listener), 10, TimeUnit.SECONDS)
        }
    }
}
