import Foundation

#if os(macOS)
import AppKit
#endif

/// Protocol for platform-specific window management.
/// Handles window sizing, positioning, state restoration, and macOS-specific features.
protocol WindowingAdapter {
    /// Configure initial window size and position.
    /// Should set reasonable defaults for the application.
    func configureWindow()

    /// Restore window state from previous session (size, position, maximized state).
    /// Returns true if state was successfully restored, false if defaults should be used.
    func restoreWindowState() -> Bool

    /// Save current window state for restoration on next launch.
    func saveWindowState()

    /// Setup window-level event handlers (resize, move, etc).
    func setupWindowEventHandlers()
}

/// Window state that can be persisted and restored.
struct WindowState: Codable {
    let width: Double
    let height: Double
    let x: Double  // Position from left
    let y: Double  // Position from top
    let isMaximized: Bool

    init(width: Double, height: Double, x: Double, y: Double, isMaximized: Bool = false) {
        self.width = width
        self.height = height
        self.x = x
        self.y = y
        self.isMaximized = isMaximized
    }
}
