import Foundation
import AppKit
import Combine

/// Implementation of KeyboardCommandsAdapter for macOS.
/// Registers keyboard shortcuts in the menu bar and handles global keyboard events.
@MainActor
final class MacMenuCommandsAdapter: KeyboardCommandsAdapter {
    weak var playerActions: PlayerRemoteCommandActions?
    
    private var eventMonitor: Any?
    private var menuItems: [NSMenuItem] = []

    init(playerActions: PlayerRemoteCommandActions? = nil) {
        self.playerActions = playerActions
    }

    // MARK: KeyboardCommandsAdapter

    func registerKeyboardCommands() {
        // Setup menu bar shortcuts
        setupMenuShortcuts()
        
        // Setup global keyboard event monitoring
        setupGlobalKeyboardMonitoring()
    }

    func unregisterKeyboardCommands() {
        // Remove event monitor
        if let monitor = eventMonitor {
            NSEvent.removeMonitor(monitor)
            eventMonitor = nil
        }
        
        // Remove menu items
        removeMenuItems()
    }

    func shouldHandleKeyboardEvent(_ event: KeyboardEvent) -> Bool {
        // Check if first responder is a text field
        guard let focus = NSApp.keyWindow?.firstResponder else {
            return true
        }

        // Don't handle if we're in a text editing context
        let isTextEditing = focus is NSTextView || focus is NSTextField
        return !isTextEditing
    }

    // MARK: Private – Menu Setup

    private func setupMenuShortcuts() {
        guard let mainMenu = NSApplication.shared.mainMenu else { return }

        // Find the main app menu
        if let appMenuItem = mainMenu.item(at: 0) {
            if let submenu = appMenuItem.submenu {
                addPlayerMenuItems(to: submenu)
            }
        } else {
            // Fallback: add a new Player menu
            let playerMenu = NSMenu(title: "Player")
            addPlayerMenuItems(to: playerMenu)
            
            let playerMenuItem = NSMenuItem(title: "Player", action: nil, keyEquivalent: "")
            playerMenuItem.submenu = playerMenu
            mainMenu.addItem(playerMenuItem)
        }
    }

    private func addPlayerMenuItems(to menu: NSMenu) {
        // Add separator
        menuItems.append(NSMenuItem.separator())
        menu.addItem(menuItems.last!)

        // Play/Pause - Space
        let playPauseItem = createMenuItem(
            title: "Play/Pause",
            keyEquivalent: " ",
            modifiers: [],
            action: #selector(playPauseAction(_:))
        )
        menuItems.append(playPauseItem)
        menu.addItem(playPauseItem)

        // Skip Forward - Right Arrow (Cmd+Right)
        let skipForwardItem = createMenuItem(
            title: "Skip Forward",
            keyEquivalent: String(UnicodeScalar(NSRightArrowFunctionKey)!),
            modifiers: [.command],
            action: #selector(skipForwardAction(_:))
        )
        menuItems.append(skipForwardItem)
        menu.addItem(skipForwardItem)

        // Skip Backward - Left Arrow (Cmd+Left)
        let skipBackwardItem = createMenuItem(
            title: "Skip Backward",
            keyEquivalent: String(UnicodeScalar(NSLeftArrowFunctionKey)!),
            modifiers: [.command],
            action: #selector(skipBackwardAction(_:))
        )
        menuItems.append(skipBackwardItem)
        menu.addItem(skipBackwardItem)

        // Next Chapter - Cmd+N
        let nextChapterItem = createMenuItem(
            title: "Next Chapter",
            keyEquivalent: "n",
            modifiers: [.command],
            action: #selector(nextChapterAction(_:))
        )
        menuItems.append(nextChapterItem)
        menu.addItem(nextChapterItem)

        // Previous Chapter - Cmd+P
        let previousChapterItem = createMenuItem(
            title: "Previous Chapter",
            keyEquivalent: "p",
            modifiers: [.command],
            action: #selector(previousChapterAction(_:))
        )
        menuItems.append(previousChapterItem)
        menu.addItem(previousChapterItem)

        // Add separator
        menuItems.append(NSMenuItem.separator())
        menu.addItem(menuItems.last!)

        // Increase Playback Rate - Cmd+Plus
        let increaseRateItem = createMenuItem(
            title: "Increase Playback Rate",
            keyEquivalent: "+",
            modifiers: [.command],
            action: #selector(increasePlaybackRateAction(_:))
        )
        menuItems.append(increaseRateItem)
        menu.addItem(increaseRateItem)

        // Decrease Playback Rate - Cmd+Minus
        let decreaseRateItem = createMenuItem(
            title: "Decrease Playback Rate",
            keyEquivalent: "-",
            modifiers: [.command],
            action: #selector(decreasePlaybackRateAction(_:))
        )
        menuItems.append(decreaseRateItem)
        menu.addItem(decreaseRateItem)

        // Reset Playback Rate - Cmd+0
        let resetRateItem = createMenuItem(
            title: "Reset Playback Rate",
            keyEquivalent: "0",
            modifiers: [.command],
            action: #selector(resetPlaybackRateAction(_:))
        )
        menuItems.append(resetRateItem)
        menu.addItem(resetRateItem)
    }

    private func createMenuItem(
        title: String,
        keyEquivalent: String,
        modifiers: NSEvent.ModifierFlags,
        action: Selector
    ) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: keyEquivalent)
        item.target = self
        item.keyEquivalentModifierMask = modifiers
        return item
    }

    private func removeMenuItems() {
        for item in menuItems {
            item.menu?.removeItem(item)
        }
        menuItems.removeAll()
    }

    // MARK: Global Keyboard Monitoring

    private func setupGlobalKeyboardMonitoring() {
        // Monitor keyboard events for playback control when not in menus
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self else { return event }
            
            // Only process if we should handle keyboard events
            guard self.shouldHandleKeyboardEvent(
                KeyboardEvent(
                    key: event.characters ?? "",
                    modifiers: KeyboardModifiers(rawValue: Int(event.modifierFlags.rawValue)),
                    isRepeat: event.isARepeat
                )
            ) else {
                return event
            }

            // Handle global shortcuts
            if event.modifierFlags.contains(.command) {
                let char = event.characters?.lowercased() ?? ""
                switch char {
                case "n":
                    self.playerActions?.handleSkipForwardMediaAction()
                    return nil // Consume event
                case "p":
                    self.playerActions?.handleSkipBackwardMediaAction()
                    return nil // Consume event
                case "+":
                    self.increasePlaybackRateAction(nil)
                    return nil // Consume event
                case "-":
                    self.decreasePlaybackRateAction(nil)
                    return nil // Consume event
                case "0":
                    self.resetPlaybackRateAction(nil)
                    return nil // Consume event
                default:
                    break
                }
            }

            // Space for play/pause (when not in text field)
            if event.keyCode == 49 { // Space key
                self.playerActions?.playPressed()
                return nil // Consume event
            }

            // Arrow keys with command modifier
            if event.modifierFlags.contains(.command) {
                switch event.keyCode {
                case 123: // Left arrow
                    self.playerActions?.handleSkipBackwardMediaAction()
                    return nil
                case 124: // Right arrow
                    self.playerActions?.handleSkipForwardMediaAction()
                    return nil
                default:
                    break
                }
            }

            return event
        }
    }

    // MARK: Menu Actions

    @objc private func playPauseAction(_ sender: Any?) {
        playerActions?.playPressed()
    }

    @objc private func skipForwardAction(_ sender: Any?) {
        playerActions?.handleSkipForwardMediaAction()
    }

    @objc private func skipBackwardAction(_ sender: Any?) {
        playerActions?.handleSkipBackwardMediaAction()
    }

    @objc private func nextChapterAction(_ sender: Any?) {
        playerActions?.handleSkipForwardMediaAction()
    }

    @objc private func previousChapterAction(_ sender: Any?) {
        playerActions?.handleSkipBackwardMediaAction()
    }

    @objc private func increasePlaybackRateAction(_ sender: Any?) {
        // Dispatch to PlayerViewModel playback rate increase
        // This would typically be part of a playback control protocol
        NotificationCenter.default.post(name: NSNotification.Name("playback.increaseRate"), object: nil)
    }

    @objc private func decreasePlaybackRateAction(_ sender: Any?) {
        // Dispatch to PlayerViewModel playback rate decrease
        NotificationCenter.default.post(name: NSNotification.Name("playback.decreaseRate"), object: nil)
    }

    @objc private func resetPlaybackRateAction(_ sender: Any?) {
        // Dispatch to PlayerViewModel playback rate reset
        NotificationCenter.default.post(name: NSNotification.Name("playback.resetRate"), object: nil)
    }
}

