import Foundation

/// Protocol for handling platform-specific keyboard shortcuts and commands.
/// Provides unified interface for registering and managing keyboard input across platforms.
protocol KeyboardCommandsAdapter {
    /// Register keyboard shortcuts for common player actions (play, pause, skip, etc).
    /// Should handle platform-specific keyboard layouts and conventions.
    func registerKeyboardCommands()

    /// Remove all registered keyboard command handlers.
    func unregisterKeyboardCommands()

    /// Check if a keyboard event should be handled by the player.
    /// Returns true if the input should be consumed, false if it should propagate.
    func shouldHandleKeyboardEvent(_ event: KeyboardEvent) -> Bool
}

/// Represents a keyboard event that can be handled by adapters.
struct KeyboardEvent {
    let key: String
    let modifiers: KeyboardModifiers
    let isRepeat: Bool

    init(key: String, modifiers: KeyboardModifiers = [], isRepeat: Bool = false) {
        self.key = key
        self.modifiers = modifiers
        self.isRepeat = isRepeat
    }
}

/// Keyboard modifiers (cmd, shift, option, control).
struct KeyboardModifiers: OptionSet {
    let rawValue: Int

    static let command = KeyboardModifiers(rawValue: 1 << 0)
    static let shift = KeyboardModifiers(rawValue: 1 << 1)
    static let option = KeyboardModifiers(rawValue: 1 << 2)
    static let control = KeyboardModifiers(rawValue: 1 << 3)
}
