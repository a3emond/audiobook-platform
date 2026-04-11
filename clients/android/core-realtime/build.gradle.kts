plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.audiobook.core.realtime"
    compileSdk = 35
    defaultConfig { minSdk = 28 }
}

dependencies {
    implementation(project(":core-auth"))
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
