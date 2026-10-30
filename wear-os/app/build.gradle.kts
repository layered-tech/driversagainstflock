plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val releaseVersionCode = providers.environmentVariable("WEAR_VERSION_CODE").orNull
val watchVersionCode = releaseVersionCode?.toIntOrNull() ?: 1
require(releaseVersionCode == null || (releaseVersionCode.matches(Regex("[1-9][0-9]*")) && releaseVersionCode.toIntOrNull() in 1..2_100_000_000)) {
    "WEAR_VERSION_CODE must be an integer between 1 and 2100000000."
}
val watchVersionName = providers.environmentVariable("WEAR_VERSION_NAME").orElse("0.2.0").get()
val watchBuildEnvironment = providers.environmentVariable("WEAR_BUILD_ENV").orElse("production").get()
require(watchBuildEnvironment in setOf("staging", "production")) { "WEAR_BUILD_ENV must be staging or production." }
require(watchVersionName.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?"))) {
    "WEAR_VERSION_NAME must be a version such as 0.1.0."
}
val releaseStorePath = providers.environmentVariable("WEAR_RELEASE_STORE_FILE").orNull
val releaseStorePassword = providers.environmentVariable("WEAR_RELEASE_STORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("WEAR_RELEASE_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("WEAR_RELEASE_KEY_PASSWORD").orNull

val validateWearRelease by tasks.registering {
    group = "verification"
    description = "Check explicit Play versioning and upload signing configuration without building."
    doLast {
        require(releaseVersionCode != null) {
            "Set WEAR_VERSION_CODE to an unused Play version code (shared across phone and watch)."
        }
        require(!releaseStorePath.isNullOrBlank() && rootProject.file(releaseStorePath).isFile) {
            "Set WEAR_RELEASE_STORE_FILE to your existing Play upload keystore."
        }
        require(!releaseStorePassword.isNullOrBlank() && !releaseKeyAlias.isNullOrBlank() && !releaseKeyPassword.isNullOrBlank()) {
            "Set WEAR_RELEASE_STORE_PASSWORD, WEAR_RELEASE_KEY_ALIAS, and WEAR_RELEASE_KEY_PASSWORD."
        }
        require(releaseKeyAlias != "androiddebugkey") { "Play bundles must use your upload key, not the Android debug key." }
    }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn(validateWearRelease) }

android {
    namespace = "org.driversagainstflock.watch"
    compileSdk = 37
    defaultConfig {
        applicationId = "com.anonymous.drivefree"
        minSdk = 30
        targetSdk = 37
        versionCode = watchVersionCode
        versionName = watchVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    signingConfigs {
        create("phoneStaging") {
            // Local PoC phone and watch use the same development certificate.
            storeFile = rootProject.file(providers.environmentVariable("WEAR_STAGING_STORE_FILE")
                .orElse("../expo/android/app/debug.keystore").get())
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        create("playUpload") {
            storeFile = releaseStorePath?.let { rootProject.file(it) }
            storePassword = releaseStorePassword
            keyAlias = releaseKeyAlias
            keyPassword = releaseKeyPassword
        }
    }
    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("phoneStaging")
            resValue("string", "app_name", "Staging | DAF")
            buildConfigField("String", "APP_ENVIRONMENT", "\"staging\"")
        }
        release {
            signingConfig = signingConfigs.getByName("playUpload")
            resValue("string", "app_name", if (watchBuildEnvironment == "staging") "Staging | DAF" else "Drivers Against Flock")
            buildConfigField("String", "APP_ENVIRONMENT", "\"$watchBuildEnvironment\"")
        }
    }
    buildFeatures { compose = true; buildConfig = true; resValues = true }
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
    implementation("androidx.wear:wear-ongoing:1.1.0")
    implementation("com.google.android.gms:play-services-wearable:20.0.1")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4:1.8.3")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
    debugImplementation("androidx.compose.ui:ui-test-manifest:1.8.3")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
