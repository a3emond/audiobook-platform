import Foundation
import AppKit

/// Implementation of WindowingAdapter for macOS.
/// Manages window sizing, positioning, and state persistence with smart restoration.
@MainActor
final class MacOSWindowingAdapter: WindowingAdapter {
    private let stateKey = "com.storywave.window.state"
    private let defaults = UserDefaults.standard
    
    private weak var window: NSWindow?
    private var resizeThrottleTimer: Timer?
    private var lastKnownFrame: NSRect = .zero

    init(window: NSWindow? = nil) {
        // Get the initial window from the app if not provided
        if let window = window {
            self.window = window
        } else {
            findMainWindow()
        }
    }

    // MARK: WindowingAdapter

    func configureWindow() {
        guard let window = window else { return }

        // Set minimum window size
        window.minSize = NSSize(width: 800, height: 600)
        
        // Set maximum size to screen size (optional)
        if let screen = window.screen ?? NSScreen.main {
            window.maxSize = NSSize(
                width: screen.frame.width,
                height: screen.frame.height
            )
        }

        // Try to restore previous state
        if !restoreWindowState() {
            applyDefaultWindowSize(to: window)
        }

        // Remember current frame for later comparison
        lastKnownFrame = window.frame
        
        // Setup event handlers
        setupWindowEventHandlers()
    }

    func restoreWindowState() -> Bool {
        guard let window = window else { return false }
        guard let data = defaults.data(forKey: stateKey) else { return false }

        do {
            let decoder = JSONDecoder()
            let state = try decoder.decode(WindowState.self, from: data)

            // Validate that the saved frame is still on a visible screen
            let restoredFrame = NSRect(
                x: state.x,
                y: state.y,
                width: max(state.width, window.minSize.width),
                height: max(state.height, window.minSize.height)
            )

            // Check if frame is visible on any screen
            let screensContainFrame = NSScreen.screens.contains { screen in
                screen.visibleFrame.intersects(restoredFrame)
            }

            if screensContainFrame {
                window.setFrame(restoredFrame, display: true, animate: false)

                // Restore maximized state
                if state.isMaximized && !window.isZoomed {
                    window.zoom(nil)
                }

                lastKnownFrame = restoredFrame
                return true
            } else {
                // Saved frame is not visible on current screen setup
                return false
            }
        } catch {
            print("Failed to restore window state: \(error)")
            return false
        }
    }

    func saveWindowState() {
        guard let window = window else { return }

        let frame = window.frame
        let isMaximized = window.isZoomed

        let state = WindowState(
            width: frame.width,
            height: frame.height,
            x: frame.minX,
            y: frame.minY,
            isMaximized: isMaximized
        )

        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(state)
            defaults.set(data, forKey: stateKey)
            defaults.synchronize()
        } catch {
            print("Failed to save window state: \(error)")
        }
    }

    func setupWindowEventHandlers() {
        guard let window = window else { return }

        // Monitor window close
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(windowWillClose),
            name: NSWindow.willCloseNotification,
            object: window
        )

        // Monitor window resize with throttling
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(windowDidResize),
            name: NSWindow.didResizeNotification,
            object: window
        )

        // Monitor window move
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(windowDidMove),
            name: NSWindow.didMoveNotification,
            object: window
        )

        // Monitor when window becomes/resigns key
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(windowDidBecomeKey),
            name: NSWindow.didBecomeKeyNotification,
            object: window
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(windowDidResignKey),
            name: NSWindow.didResignKeyNotification,
            object: window
        )

        // Monitor zoom/unzoom
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(windowDidZoom),
            name: NSWindow.didResizeNotification,
            object: window
        )
    }

    // MARK: Private – Helpers

    private func findMainWindow() {
        // Try to find the main window
        if let keyWindow = NSApplication.shared.keyWindow {
            self.window = keyWindow
        } else if let mainWindow = NSApplication.shared.mainWindow {
            self.window = mainWindow
        } else {
            self.window = NSApplication.shared.windows.first
        }
    }

    private func applyDefaultWindowSize(to window: NSWindow) {
        // Default: 1240 × 900 (widescreen)
        let defaultSize = NSSize(width: 1240, height: 900)

        // Center on the main screen
        if let screen = NSScreen.main {
            let screenFrame = screen.visibleFrame
            let windowWidth = min(defaultSize.width, screenFrame.width * 0.9)
            let windowHeight = min(defaultSize.height, screenFrame.height * 0.9)

            let windowFrame = NSRect(
                x: screenFrame.midX - windowWidth / 2,
                y: screenFrame.midY - windowHeight / 2,
                width: windowWidth,
                height: windowHeight
            )

            window.setFrame(windowFrame, display: true, animate: false)
            lastKnownFrame = windowFrame
        }
    }

    // MARK: Window Event Handlers

    @objc private func windowWillClose() {
        saveWindowState()
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func windowDidResize() {
        // Throttle resize events to avoid saving too frequently
        resizeThrottleTimer?.invalidate()
        resizeThrottleTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { [weak self] _ in
            self?.saveWindowState()
        }
    }

    @objc private func windowDidMove() {
        saveWindowState()
    }

    @objc private func windowDidBecomeKey() {
        // Window became active - could restore if needed
    }

    @objc private func windowDidResignKey() {
        // Window resigned key - save state
        saveWindowState()
    }

    @objc private func windowDidZoom() {
        // Window zoomed/unzoomed - save state
        saveWindowState()
    }

    deinit {
        resizeThrottleTimer?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }
}
