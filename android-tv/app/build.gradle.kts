plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}
val releaseVersionCode = providers.environmentVariable("TV_VERSION_CODE").orNull
val parsedVersionCode = releaseVersionCode?.toIntOrNull()
val tvVersionCode = parsedVersionCode ?: 1
require(releaseVersionCode == null || (releaseVersionCode.matches(Regex("[1-9][0-9]*")) && parsedVersionCode != null && parsedVersionCode in 1..2_100_000_000)) {
    "TV_VERSION_CODE must be an integer between 1 and 2100000000."
}
val releaseVersionName = providers.environmentVariable("TV_VERSION_NAME").orNull
val tvVersionName = releaseVersionName ?: "0.1.0"
require(tvVersionName.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?"))) {
    "TV_VERSION_NAME must be a version such as 0.1.0."
}
val releaseStorePath = providers.environmentVariable("TV_RELEASE_STORE_FILE").orNull
val releaseStorePassword = providers.environmentVariable("TV_RELEASE_STORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("TV_RELEASE_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("TV_RELEASE_KEY_PASSWORD").orNull
fun publicMapboxToken(path: String): String? = rootProject.file(path).takeIf { it.isFile }?.useLines { lines ->
    lines.firstOrNull { it.trimStart().startsWith("EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=") }
        ?.substringAfter('=')?.trim()?.removeSurrounding("\"")?.removeSurrounding("'")?.takeIf { it.startsWith("pk.") }
}
val mapboxTokenOverride = providers.environmentVariable("TV_MAPBOX_ACCESS_TOKEN").orNull
    ?: providers.environmentVariable("EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN").orNull
val developmentMapboxToken = mapboxTokenOverride ?: publicMapboxToken("../expo/.env.development.local")
    ?: publicMapboxToken("../expo/.env.production") ?: ""
val productionMapboxToken = mapboxTokenOverride ?: publicMapboxToken("../expo/.env.production") ?: ""
require(developmentMapboxToken.isBlank() || developmentMapboxToken.startsWith("pk.")) { "TV Mapbox token must be a public pk. token." }
require(productionMapboxToken.isBlank() || productionMapboxToken.startsWith("pk.")) { "TV Mapbox token must be a public pk. token." }
val validateTvRelease by tasks.registering {
    group = "verification"
    description = "Validate TV release version and upload signing before building."
    doLast {
        require(releaseVersionCode != null && releaseVersionName != null) {
            "Set TV_VERSION_CODE and TV_VERSION_NAME for a production TV build."
        }
        require(!releaseStorePath.isNullOrBlank() && rootProject.file(releaseStorePath).isFile) {
            "Set TV_RELEASE_STORE_FILE to an existing upload keystore."
        }
        require(!releaseStorePassword.isNullOrBlank() && !releaseKeyAlias.isNullOrBlank() && !releaseKeyPassword.isNullOrBlank()) {
            "Set TV_RELEASE_STORE_PASSWORD, TV_RELEASE_KEY_ALIAS, and TV_RELEASE_KEY_PASSWORD."
        }
        require(releaseKeyAlias != "androiddebugkey") { "Production TV builds cannot use the Android debug key." }
        require(productionMapboxToken.isNotBlank()) { "Set TV_MAPBOX_ACCESS_TOKEN or expo/.env.production for the TV map." }
    }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn(validateTvRelease) }
android {
    namespace = "org.driversagainstflock.tv"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.anonymous.drivefree"
        minSdk = 28
        targetSdk = 36
        versionCode = tvVersionCode
        versionName = tvVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    signingConfigs {
        create("tvUpload") {
            storeFile = releaseStorePath?.let { rootProject.file(it) }
            storePassword = releaseStorePassword
            keyAlias = releaseKeyAlias
            keyPassword = releaseKeyPassword
        }
    }
    buildTypes {
        debug {
            applicationIdSuffix = ".dev"
            resValue("string", "mapbox_access_token", developmentMapboxToken)
        }
        release {
            signingConfig = signingConfigs.getByName("tvUpload")
            resValue("string", "mapbox_access_token", productionMapboxToken)
        }
    }
    buildFeatures { compose = true; buildConfig = true; resValues = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
dependencies {
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.foundation:foundation:1.8.3")
    implementation("androidx.compose.ui:ui:1.8.3")
    implementation("androidx.tv:tv-material:1.0.1")
    implementation("com.google.zxing:core:3.5.3")
    implementation("com.mapbox.maps:android-ndk27:11.24.1")
    implementation("androidx.compose.material:material-icons-extended:1.7.8")
    testImplementation("org.json:json:20240303")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
}
