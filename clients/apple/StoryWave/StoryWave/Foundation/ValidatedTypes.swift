import Foundation

/// Validated input types that provide type-safe, fail-fast validation.
/// Prevents invalid state from even being created.

// MARK: - Email Validation

/// A validated, normalized email address.
public struct ValidatedEmail: RawRepresentable, Equatable, Hashable, Codable {
    public let rawValue: String

    public init?(rawValue: String) {
        let trimmed = rawValue.trimmingCharacters(in: .whitespaces).lowercased()
        
        // Simple email validation
        guard !trimmed.isEmpty else { return nil }
        guard trimmed.contains("@") else { return nil }
        guard trimmed.contains(".") else { return nil }
        
        let parts = trimmed.split(separator: "@", maxSplits: 1, omittingEmptySubsequences: true)
        guard parts.count == 2 else { return nil }
        guard parts[0].count > 0, parts[1].count > 0 else { return nil }
        
        // Check for valid domain part
        let domain = String(parts[1])
        guard domain.contains(".") else { return nil }
        guard !domain.starts(with: ".") && !domain.hasSuffix(".") else { return nil }
        
        self.rawValue = trimmed
    }
}

// MARK: - Password Validation

/// A validated password that meets minimum security requirements.
public struct ValidatedPassword: RawRepresentable, Equatable, Hashable {
    public let rawValue: String
    
    public enum ValidationError: LocalizedError {
        case tooShort(min: Int)
        case missingUppercase
        case missingLowercase
        case missingDigit
        
        public var errorDescription: String? {
            switch self {
            case .tooShort(let min):
                return "Password must be at least \(min) characters"
            case .missingUppercase:
                return "Password must contain an uppercase letter"
            case .missingLowercase:
                return "Password must contain a lowercase letter"
            case .missingDigit:
                return "Password must contain a digit"
            }
        }
    }
    
    private static let minLength = 8

    public init?(rawValue: String) {
        guard rawValue.count >= Self.minLength else { return nil }
        guard rawValue.contains(where: { $0.isUppercase }) else { return nil }
        guard rawValue.contains(where: { $0.isLowercase }) else { return nil }
        guard rawValue.contains(where: { $0.isNumber }) else { return nil }
        
        self.rawValue = rawValue
    }
    
    public static func validate(_ password: String) -> ValidationError? {
        guard password.count >= minLength else {
            return .tooShort(min: minLength)
        }
        guard password.contains(where: { $0.isUppercase }) else {
            return .missingUppercase
        }
        guard password.contains(where: { $0.isLowercase }) else {
            return .missingLowercase
        }
        guard password.contains(where: { $0.isNumber }) else {
            return .missingDigit
        }
        return nil
    }
}

// MARK: - Display Name Validation

/// A validated display name for user profiles.
public struct ValidatedDisplayName: RawRepresentable, Equatable, Hashable, Codable {
    public let rawValue: String
    
    private static let minLength = 2
    private static let maxLength = 100

    public init?(rawValue: String) {
        let trimmed = rawValue.trimmingCharacters(in: .whitespaces)
        
        guard trimmed.count >= Self.minLength else { return nil }
        guard trimmed.count <= Self.maxLength else { return nil }
        guard !trimmed.contains(where: { $0.isNewline }) else { return nil }
        
        self.rawValue = trimmed
    }
}

// MARK: - Non-empty String

/// A string that is guaranteed to be non-empty after trimming.
public struct NonEmptyString: RawRepresentable, Equatable, Hashable, Codable {
    public let rawValue: String

    public init?(rawValue: String) {
        let trimmed = rawValue.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        self.rawValue = trimmed
    }
}

// MARK: - Playback Rate

/// A validated playback rate (0.5x to 2.0x).
public struct ValidatedPlaybackRate: RawRepresentable, Equatable, Hashable, Codable {
    public let rawValue: Double
    
    private static let minRate: Double = 0.5
    private static let maxRate: Double = 2.0
    private static let defaultRate: Double = 1.0

    public init?(rawValue: Double) {
        guard !rawValue.isNaN && !rawValue.isInfinite else { return nil }
        guard rawValue >= Self.minRate && rawValue <= Self.maxRate else { return nil }
        self.rawValue = rawValue
    }
    
    public static let `default`: ValidatedPlaybackRate = {
        ValidatedPlaybackRate(rawValue: defaultRate)!
    }()
    
    public static let minimum: ValidatedPlaybackRate = {
        ValidatedPlaybackRate(rawValue: minRate)!
    }()
    
    public static let maximum: ValidatedPlaybackRate = {
        ValidatedPlaybackRate(rawValue: maxRate)!
    }()
    
    public func increased(by step: Double = 0.1) -> ValidatedPlaybackRate? {
        ValidatedPlaybackRate(rawValue: rawValue + step)
    }
    
    public func decreased(by step: Double = 0.1) -> ValidatedPlaybackRate? {
        ValidatedPlaybackRate(rawValue: rawValue - step)
    }
}

// MARK: - ISO 639-1 Language Code

/// A validated ISO 639-1 language code (e.g., "en", "fr", "de").
public struct LanguageCode: RawRepresentable, Equatable, Hashable, Codable {
    public let rawValue: String
    
    public static let english = LanguageCode(rawValue: "en")!
    public static let french = LanguageCode(rawValue: "fr")!
    public static let german = LanguageCode(rawValue: "de")!
    public static let spanish = LanguageCode(rawValue: "es")!

    public init?(rawValue: String) {
        let code = rawValue.lowercased()
        guard code.count == 2 else { return nil }
        guard code.allSatisfy({ $0.isLetter }) else { return nil }
        self.rawValue = code
    }
}
