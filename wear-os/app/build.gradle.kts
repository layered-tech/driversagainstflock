plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "org.driversagainstflock.watch"
    compileSdk = 37
    defaultConfig {
        applicationId = "com.anonymous.drivefree"
        minSdk = 30
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    signingConfigs {
        create("phoneStaging") {
            // Local PoC phone and watch use the same development certificate.
            storeFile = file("../../expo/android/app/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }
    buildTypes {
        debug { signingConfig = signingConfigs.getByName("phoneStaging") }
        release { signingConfig = signingConfigs.getByName("phoneStaging") }
    }
    buildFeatures { compose = true; buildConfig = true }
    sourceSets.getByName("test").resources.srcDir("../contracts")
    sourceSets.getByName("androidTest").assets.srcDir("../contracts")
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.wear.compose:compose-material:1.5.6")
    implementation("androidx.wear:wear:1.3.0")
    implementation("com.google.android.gms:play-services-wearable:20.0.1")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4:1.8.3")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
    debugImplementation("androidx.compose.ui:ui-test-manifest:1.8.3")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
