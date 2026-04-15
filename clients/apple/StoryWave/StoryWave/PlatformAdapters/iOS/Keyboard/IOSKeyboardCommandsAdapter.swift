#if canImport(UIKit)
import Foundation
import UIKit
import Combine
import SwiftUI

/// Implementation of KeyboardCommandsAdapter for iOS.
/// Handles keyboard configuration for different input contexts and external keyboard shortcuts.
@MainActor
final class IOSKeyboardCommandsAdapter: KeyboardCommandsAdapter {
    weak var playerActions: PlayerRemoteCommandActions?
    
    private var keyboardMonitor: Any?
    private var eventMonitor: Any?

    init(playerActions: PlayerRemoteCommandActions? = nil) {
        self.playerActions = playerActions
    }

    // MARK: KeyboardCommandsAdapter

    func registerKeyboardCommands() {
        // Setup keyboard event monitoring for external keyboards
        setupExternalKeyboardMonitoring()
    }

    func unregisterKeyboardCommands() {
        if let monitor = keyboardMonitor {
            NotificationCenter.default.removeObserver(monitor)
            keyboardMonitor = nil
        }
        if let monitor = eventMonitor {
            NotificationCenter.default.removeObserver(monitor)
            eventMonitor = nil
        }
    }

    func shouldHandleKeyboardEvent(_ event: KeyboardEvent) -> Bool {
        // Do not handle global shortcuts while a text input is first responder.
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) else {
            return false
        }

        let responder = window.firstResponder
        return !(responder is UITextField || responder is UITextView || responder is UISearchBar)
    }

    // MARK: Private – Keyboard Configuration

    private func setupExternalKeyboardMonitoring() {
        // Monitor for physical keyboard connections
        keyboardMonitor = NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardDidShowNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.handleExternalKeyboard()
        }
    }

    private func handleExternalKeyboard() {
        // iOS external keyboard shortcuts for player control
        // These are typically handled via keyboard modifiers:
        // Space - Play/Pause
        // Arrow Left - Skip Backward
        // Arrow Right - Skip Forward
        
        // Note: SwiftUI doesn't expose raw keyboard events easily
        // For production, this would typically be handled in a custom UIViewController
        // or by using a custom NSView subclass on iOS
    }
}

private extension UIView {
    var firstResponder: UIView? {
        if isFirstResponder { return self }
        for subview in subviews {
            if let responder = subview.firstResponder {
                return responder
            }
        }
        return nil
    }
}

// MARK: - Keyboard Configuration Helpers

/// Configuration for a specific keyboard type and input behavior.
public struct KeyboardConfiguration {
    /// The type of keyboard to display.
    public let keyboardType: UIKeyboardType
    /// Whether to capitalize sentences, words, or nothing.
    public let autocapitalization: UITextAutocapitalizationType
    /// Whether to enable autocorrection.
    public let autocorrection: UITextAutocorrectionType
    /// Whether to enable spell checking.
    public let spellCheck: UITextSpellCheckingType
    /// The return key type.
    public let returnKeyType: UIReturnKeyType
    /// Whether to enable secure text entry.
    public let isSecure: Bool
    
    // MARK: Built-in Configurations

    /// Email input: email keyboard, no caps, no autocorrect
    public static let email = KeyboardConfiguration(
        keyboardType: .emailAddress,
        autocapitalization: .none,
        autocorrection: .no,
        spellCheck: .no,
        returnKeyType: .done,
        isSecure: false
    )

    /// Password input: default keyboard, no caps, no autocorrect, secure
    public static let password = KeyboardConfiguration(
        keyboardType: .default,
        autocapitalization: .none,
        autocorrection: .no,
        spellCheck: .no,
        returnKeyType: .done,
        isSecure: true
    )

    /// Display name: default keyboard with caps, no autocorrect
    public static let displayName = KeyboardConfiguration(
        keyboardType: .default,
        autocapitalization: .words,
        autocorrection: .no,
        spellCheck: .no,
        returnKeyType: .done,
        isSecure: false
    )

    /// Search: default keyboard, no caps, search return key
    public static let search = KeyboardConfiguration(
        keyboardType: .default,
        autocapitalization: .none,
        autocorrection: .no,
        spellCheck: .no,
        returnKeyType: .search,
        isSecure: false
    )

    /// Message: default keyboard with autocorrect
    public static let message = KeyboardConfiguration(
        keyboardType: .default,
        autocapitalization: .sentences,
        autocorrection: .yes,
        spellCheck: .yes,
        returnKeyType: .send,
        isSecure: false
    )

    /// Chapter title: default keyboard, no caps, no autocorrect
    public static let title = KeyboardConfiguration(
        keyboardType: .default,
        autocapitalization: .none,
        autocorrection: .no,
        spellCheck: .no,
        returnKeyType: .done,
        isSecure: false
    )

    /// Number input: number pad keyboard
    public static let number = KeyboardConfiguration(
        keyboardType: .numberPad,
        autocapitalization: .none,
        autocorrection: .no,
        spellCheck: .no,
        returnKeyType: .done,
        isSecure: false
    )

    /// Decimal input: decimal pad keyboard
    public static let decimal = KeyboardConfiguration(
        keyboardType: .decimalPad,
        autocapitalization: .none,
        autocorrection: .no,
        spellCheck: .no,
        returnKeyType: .done,
        isSecure: false
    )

    public init(
        keyboardType: UIKeyboardType,
        autocapitalization: UITextAutocapitalizationType,
        autocorrection: UITextAutocorrectionType,
        spellCheck: UITextSpellCheckingType,
        returnKeyType: UIReturnKeyType,
        isSecure: Bool
    ) {
        self.keyboardType = keyboardType
        self.autocapitalization = autocapitalization
        self.autocorrection = autocorrection
        self.spellCheck = spellCheck
        self.returnKeyType = returnKeyType
        self.isSecure = isSecure
    }
}

// MARK: - SwiftUI Modifiers for Keyboard Configuration

extension View {
    /// Applies keyboard configuration to a TextField or SecureField.
    public func keyboardStyle(_ config: KeyboardConfiguration) -> some View {
        self
            .keyboardType(config.keyboardType)
            .textInputAutocapitalization(
                config.autocapitalization == .none ? .never :
                config.autocapitalization == .words ? .words :
                config.autocapitalization == .sentences ? .sentences :
                .characters
            )
            .autocorrectionDisabled(config.autocorrection == .no)
    }
}

#else
import Foundation
@MainActor
final class IOSKeyboardCommandsAdapter: KeyboardCommandsAdapter {
    weak var playerActions: PlayerRemoteCommandActions?

    init(playerActions: PlayerRemoteCommandActions? = nil) {
        self.playerActions = playerActions
    }

    func registerKeyboardCommands() {}
    func unregisterKeyboardCommands() {}

    func shouldHandleKeyboardEvent(_ event: KeyboardEvent) -> Bool {
        // On non-UIKit platforms, default to true so higher layers can decide.
        return true
    }
}

// Minimal stubs to allow compilation of modifiers and configuration when UIKit isn't present.
public struct KeyboardConfiguration {
    public init(
        keyboardType: Int = 0,
        autocapitalization: Int = 0,
        autocorrection: Int = 0,
        spellCheck: Int = 0,
        returnKeyType: Int = 0,
        isSecure: Bool = false
    ) {}

    public static let email = KeyboardConfiguration()
    public static let password = KeyboardConfiguration()
    public static let displayName = KeyboardConfiguration()
    public static let search = KeyboardConfiguration()
    public static let message = KeyboardConfiguration()
    public static let title = KeyboardConfiguration()
    public static let number = KeyboardConfiguration()
    public static let decimal = KeyboardConfiguration()
}
#endif

