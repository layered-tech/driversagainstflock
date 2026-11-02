plugins {
    id("com.android.application")
}

android {
    enableKotlin = false
    namespace = "org.driversagainstflock.watch.debugface"
    compileSdk = 37

    defaultConfig {
        applicationId = "org.driversagainstflock.watch.debugface"
        minSdk = 33
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        debug {
            isMinifyEnabled = true
            isShrinkResources = false
        }
    }
}

androidComponents {
    beforeVariants(selector().withBuildType("release")) { it.enable = false }
}
