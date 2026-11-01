package expo.modules.automotivesetup

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AutomotiveSetupModule : Module() {
    private fun automotiveContext(): android.content.Context {
        val context = appContext.reactContext ?: error("App context is unavailable")
        val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
        check(info.metaData?.getString("daf.appTarget") == "automotive") { "Car setup is only available in the Automotive app" }
        check(context.packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)) { "An Automotive device is required" }
        return context
    }

    override fun definition() = ModuleDefinition {
        Name("AutomotiveSetup")

        AsyncFunction("openSetup") {
            val context = automotiveContext()
            // MainActivity is private, has no deep links, and is not distraction optimized.
            // The vehicle OS blocks its use whenever driving restrictions apply.
            context.startActivity(Intent().apply {
                setClassName(context.packageName, "${context.packageName}.MainActivity")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        }

        AsyncFunction("finishSetup") {
            automotiveContext()
            appContext.currentActivity?.let { activity ->
                if (activity.javaClass.simpleName == "MainActivity") {
                    activity.runOnUiThread { activity.finish() }
                }
            }
        }

        AsyncFunction("openLocationSettings") {
            val context = automotiveContext()
            context.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }

        AsyncFunction("openAppSettings") {
            val context = automotiveContext()
            context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}
