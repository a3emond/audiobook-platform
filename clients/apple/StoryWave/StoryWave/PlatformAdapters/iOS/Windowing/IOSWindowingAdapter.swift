#if canImport(UIKit)
import Foundation
import UIKit
import SwiftUI

/// Implementation of WindowingAdapter for iOS.
/// Manages window appearance, safe area layout, and app state restoration.
@MainActor
final class IOSWindowingAdapter: WindowingAdapter {
    private let sceneStateKey = "com.storywave.scene.state"
    private let defaults = UserDefaults.standard
    
    private weak var window: UIWindow?

    init(window: UIWindow? = nil) {
        if let window = window {
            self.window = window
        } else {
            self.window = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first
        }
    }

    // MARK: WindowingAdapter

    func configureWindow() {
        guard let window = window else { return }

        // Configure appearance
        configureAppearance(for: window)
        
        // Configure safe area and layout guides
        setupLayoutGuides()
        
        // Restore any saved app state
        restoreWindowState()
    }

    func restoreWindowState() -> Bool {
        // iOS handles scene state through standard mechanisms:
        // - SceneDelegate manages state restoration
        // - App suspension/resumption is handled by UIKit
        // - View controller state is managed by navigation
        
        // Return false as iOS doesn't use custom window state restoration
        // like macOS does
        return false
    }

    func saveWindowState() {
        // iOS automatically saves app state through standard mechanisms
        // No explicit saving needed
    }

    func setupWindowEventHandlers() {
        // iOS window events are managed through:
        // - SceneDelegate lifecycle methods
        // - AppDelegate state restoration
        // - View controller lifecycle
        // No additional setup needed here
    }

    // MARK: Private – Configuration

    private func configureAppearance(for window: UIWindow) {
        // Configure window appearance based on system settings
        if #available(iOS 13.0, *) {
            // Use system colors that respond to light/dark mode
            window.overrideUserInterfaceStyle = .unspecified // Follow system
        }

        // Configure navigation bar appearance
        let navigationBarAppearance = UINavigationBarAppearance()
        navigationBarAppearance.configureWithDefaultBackground()
        UINavigationBar.appearance().standardAppearance = navigationBarAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navigationBarAppearance

        // Configure tab bar appearance
        let tabBarAppearance = UITabBarAppearance()
        tabBarAppearance.configureWithDefaultBackground()
        UITabBar.appearance().standardAppearance = tabBarAppearance
        if #available(iOS 15.0, *) {
            UITabBar.appearance().scrollEdgeAppearance = tabBarAppearance
        }
    }

    private func setupLayoutGuides() {
        guard let window = window else { return }

        // iOS handles safe area automatically through layout guides
        // for all UIView and SwiftUI content
        
        // Disable top/bottom safe area insets if desired for full-screen content
        if #available(iOS 13.0, *) {
            // Safe area is respected by default
            // No additional setup needed
        }
    }
}
#endif

