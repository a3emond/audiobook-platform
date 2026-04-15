import SwiftUI

#if canImport(UIKit)

// MARK: - iOS Keyboard Configuration Extensions

/// Extension providing keyboard configuration for common iOS input contexts.
extension View {
    /// Apply authentication field keyboard configuration (email, password).
    public func authenticationKeyboard(_ type: AuthKeyboardType) -> some View {
        let config: KeyboardConfiguration
        
        switch type {
        case .email:
            config = .email
        case .password:
            config = .password
        case .displayName:
            config = .displayName
        }
        
        return keyboardStyle(config)
    }

    /// Apply message input keyboard configuration.
    public func messageKeyboard() -> some View {
        keyboardStyle(.message)
    }

    /// Apply search keyboard configuration.
    public func searchKeyboard() -> some View {
        keyboardStyle(.search)
    }

    /// Apply chapter title keyboard configuration.
    public func chapterKeyboard() -> some View {
        keyboardStyle(.title)
    }

    /// Apply numeric input keyboard configuration.
    public func numericKeyboard(allowDecimal: Bool = false) -> some View {
        keyboardStyle(allowDecimal ? .decimal : .number)
    }
}

/// Keyboard types for authentication fields.
public enum AuthKeyboardType {
    case email
    case password
    case displayName
}

#endif
