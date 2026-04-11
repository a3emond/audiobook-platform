plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.audiobook.core.domain"
    compileSdk = 35
    defaultConfig { minSdk = 28 }
}
