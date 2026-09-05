package expo.modules.androidautohostlifecycle

import android.app.Activity
import android.app.Application
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.common.LifecycleState
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Keeps the React host resumed while an Android Auto session is connected.
 *
 * React Native pauses its host whenever the phone activity pauses (screen lock,
 * another app in front): JS timers without a headless task, Animated,
 * Reanimated and Expo module foreground state all stop until the activity
 * resumes. Android Auto keeps drawing the car surface from that same React
 * host, so those pauses freeze car-screen updates until the phone is unlocked.
 * iOS CarPlay scenes keep the app foreground on their own, so this module is
 * Android only.
 */
class AndroidAutoHostLifecycleModule : Module() {
    @Volatile
    private var carSessionIsConnected = false

    @Volatile
    private var hostActivityIsPaused = false

    @Volatile
    private var isApplyingHostLifecycle = false

    private var observedApplication: Application? = null
    private var observedReactContext: ReactContext? = null

    private val reactHost: ReactHost?
        get() = (observedReactContext?.applicationContext as? ReactApplication)?.reactHost

    private val hostLifecycleListener = object : LifecycleEventListener {
        override fun onHostResume() = Unit

        override fun onHostPause() {
            if (isApplyingHostLifecycle || !carSessionIsConnected) {
                return
            }

            // React Native finishes its own pause transition after notifying
            // listeners, so resume the host on the next main-thread turn.
            UiThreadUtil.runOnUiThread { resumeHostForCarSession() }
        }

        override fun onHostDestroy() = Unit
    }

    private val activityLifecycleCallbacks = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityResumed(activity: Activity) {
            if (activity is ReactActivity) {
                hostActivityIsPaused = false
            }
        }

        override fun onActivityPaused(activity: Activity) {
            if (activity is ReactActivity) {
                hostActivityIsPaused = true
            }
        }

        override fun onActivityDestroyed(activity: Activity) {
            if (activity is ReactActivity) {
                hostActivityIsPaused = false
            }
        }

        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit

        override fun onActivityStarted(activity: Activity) = Unit

        override fun onActivityStopped(activity: Activity) = Unit

        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    }

    override fun definition() = ModuleDefinition {
        Name("AndroidAutoHostLifecycle")

        OnCreate {
            val reactContext = appContext.reactContext as? ReactContext ?: return@OnCreate
            val application = reactContext.applicationContext as? Application

            observedReactContext = reactContext
            observedApplication = application
            hostActivityIsPaused = reactContext.currentActivity != null &&
                reactContext.lifecycleState != LifecycleState.RESUMED
            reactContext.addLifecycleEventListener(hostLifecycleListener)
            application?.registerActivityLifecycleCallbacks(activityLifecycleCallbacks)
        }

        OnDestroy {
            observedReactContext?.removeLifecycleEventListener(hostLifecycleListener)
            observedApplication?.unregisterActivityLifecycleCallbacks(activityLifecycleCallbacks)
            observedReactContext = null
            observedApplication = null
        }

        AsyncFunction("setCarSessionConnected") { isConnected: Boolean ->
            carSessionIsConnected = isConnected

            if (isConnected) {
                resumeHostForCarSession()
            } else {
                pauseHostAfterCarSession()
            }
        }.runOnQueue(Queues.MAIN)
    }

    private fun resumeHostForCarSession() {
        if (!carSessionIsConnected || !hostActivityIsPaused) {
            return
        }

        val host = reactHost ?: return
        val activity = observedReactContext?.currentActivity ?: return

        if (activity.isFinishing || activity.isDestroyed) {
            return
        }

        if (host.lifecycleState == LifecycleState.RESUMED) {
            return
        }

        applyHostLifecycle {
            host.onHostResume(activity, activity as? DefaultHardwareBackBtnHandler)
        }
    }

    private fun pauseHostAfterCarSession() {
        if (carSessionIsConnected || !hostActivityIsPaused) {
            return
        }

        val host = reactHost ?: return

        if (host.lifecycleState != LifecycleState.RESUMED) {
            return
        }

        val activity = observedReactContext?.currentActivity

        applyHostLifecycle {
            if (activity != null) {
                host.onHostPause(activity)
            } else {
                host.onHostPause()
            }
        }
    }

    private inline fun applyHostLifecycle(block: () -> Unit) {
        isApplyingHostLifecycle = true

        try {
            block()
        } finally {
            isApplyingHostLifecycle = false
        }
    }
}
