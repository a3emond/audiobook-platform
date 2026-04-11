import Foundation

public class LocalizationService {
    public static let shared = LocalizationService()
    
    private let userDefaults = UserDefaults.standard
    private let localeKey = "app.locale"
    private var cachedMessages: [String: String] = [:]
    private var currentLocale: String = "en"
    
    public var locale: String {
        didSet {
            detectLocaleChangeAndReload()
        }
    }
    
    public init() {
        // Detect saved locale, fall back to device language, default to English
        let saved = userDefaults.string(forKey: localeKey)
        let deviceLang = Locale.preferredLanguages.first?.lowercased().split(separator: "-").first.map(String.init) ?? "en"
        
        self.currentLocale = saved ?? (deviceLang == "fr" ? "fr" : "en")
        self.locale = currentLocale
        
        Task {
            await loadDictionary(for: currentLocale)
        }
    }
    
    /// Load dictionary for a given locale
    public func setLocale(_ newLocale: String) async throws {
        guard newLocale == "en" || newLocale == "fr" else {
            throw LocalizationError.unsupportedLocale(newLocale)
        }
        
        currentLocale = newLocale
        locale = newLocale
        userDefaults.set(newLocale, forKey: localeKey)
        
        try await loadDictionary(for: newLocale)
    }
    
    /// Translate a key
    public func translate(_ key: String, fallback: String? = nil) -> String {
        if let translation = cachedMessages[key] {
            return translation
        }
        return fallback ?? key
    }
    
    private func detectLocaleChangeAndReload() {
        Task {
            try await loadDictionary(for: locale)
        }
    }
    
    private func loadDictionary(for locale: String) async throws {
        // Construct URL to fetch from backend or local bundle
        let fileName = "\(locale).json"
        
        if let bundleURL = Bundle.main.url(forResource: locale, withExtension: "json") {
            // Load from bundle
            let data = try Data(contentsOf: bundleURL)
            if let dict = try JSONSerialization.jsonObject(with: data) as? [String: String] {
                cachedMessages = dict
                return
            }
        }
        
        // If no bundle file, we'll rely on translations defined in code
        cachedMessages = defaultTranslations(for: locale)
    }
    
    private func defaultTranslations(for locale: String) -> [String: String] {
        if locale == "fr" {
            return [
                "app.title": "Plateforme d'audiolivres",
                "nav.library": "Bibliothèque",
                "nav.discussions": "Discussions",
                "nav.profile": "Profil",
                "nav.language": "Langue",
                "nav.lang.en": "English",
                "nav.lang.fr": "Français",
                "auth.login.title": "Connexion",
                "auth.logout": "Déconnexion",
                "auth.email": "E-mail",
                "auth.password": "Mot de passe",
                "book.description.empty": "Aucune description disponible",
                "discussions.title": "Discussions",
                "discussions.lang.en": "English",
                "discussions.lang.fr": "Français",
            ]
        }
        
        return [
            "app.title": "Audiobook Platform",
            "nav.library": "Library",
            "nav.discussions": "Discussions",
            "nav.profile": "Profile",
            "nav.language": "Language",
            "nav.lang.en": "English",
            "nav.lang.fr": "Français",
            "auth.login.title": "Login",
            "auth.logout": "Logout",
            "auth.email": "Email",
            "auth.password": "Password",
            "book.description.empty": "No description available",
            "discussions.title": "Discussions",
            "discussions.lang.en": "English",
            "discussions.lang.fr": "Français",
        ]
    }
}

public enum LocalizationError: Error {
    case unsupportedLocale(String)
    case failedToLoadDictionary(String)
}
