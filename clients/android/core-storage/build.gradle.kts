plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.audiobook.core.storage"
    compileSdk = 35
    defaultConfig { minSdk = 28 }
}
