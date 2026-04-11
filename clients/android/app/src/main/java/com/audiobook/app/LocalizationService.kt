package com.audiobook.app

import android.content.Context
import android.content.SharedPreferences

class LocalizationService(private val context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
    private val localeKey = "app.locale"

    var currentLocale: String
        get() {
            val saved = prefs.getString(localeKey, null)
            val deviceLang = getDeviceLanguage()
            return saved ?: (if (deviceLang == "fr") "fr" else "en")
        }
        set(locale) {
            if (locale == "en" || locale == "fr") {
                prefs.edit().putString(localeKey, locale).apply()
            }
        }

    private fun getDeviceLanguage(): String {
        return android.content.res.Configuration().locales[0].language
    }

    fun translate(key: String, fallback: String = key): String {
        return getTranslations()[key] ?: fallback
    }

    private fun getTranslations(): Map<String, String> {
        return if (currentLocale == "fr") {
            mapOf(
                "app.title" to "Plateforme d'audiolivres",
                "nav.library" to "Bibliothèque",
                "nav.discussions" to "Discussions",
                "nav.profile" to "Profil",
                "nav.language" to "Langue",
                "nav.lang.en" to "English",
                "nav.lang.fr" to "Français",
                "auth.login.title" to "Connexion",
                "auth.logout" to "Déconnexion",
                "auth.email" to "E-mail",
                "auth.password" to "Mot de passe",
                "book.description.empty" to "Aucune description disponible",
                "discussions.title" to "Discussions",
                "discussions.lang.en" to "English",
                "discussions.lang.fr" to "Français",
            )
        } else {
            mapOf(
                "app.title" to "Audiobook Platform",
                "nav.library" to "Library",
                "nav.discussions" to "Discussions",
                "nav.profile" to "Profile",
                "nav.language" to "Language",
                "nav.lang.en" to "English",
                "nav.lang.fr" to "Français",
                "auth.login.title" to "Login",
                "auth.logout" to "Logout",
                "auth.email" to "Email",
                "auth.password" to "Password",
                "book.description.empty" to "No description available",
                "discussions.title" to "Discussions",
                "discussions.lang.en" to "English",
                "discussions.lang.fr" to "Français",
            )
        }
    }

    companion object {
        @Volatile
        private var instance: LocalizationService? = null

        fun getInstance(context: Context): LocalizationService {
            return instance ?: synchronized(this) {
                LocalizationService(context).also { instance = it }
            }
        }
    }
}
