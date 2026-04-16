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
        if window == nil {
            window = resolveWindow()
        }

        guard let window else {
            // Window can be unavailable during early startup; retry on next run loop.
            DispatchQueue.main.async { [weak self] in
                self?.configureWindow()
            }
            return
        }

        // Configure appearance
        configureAppearance(for: window)

        // Force the hosting hierarchy to draw edge-to-edge.
        applyEdgeToEdgeLayout(for: window)
        
        // Configure safe area and layout guides
        setupLayoutGuides(for: window)
        
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

    func topSafeAreaInset() -> CGFloat {
        if let resolved = resolveWindow() {
            return resolved.safeAreaInsets.top
        }
        return 0
    }

    // MARK: Private – Configuration

    private func resolveWindow() -> UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: { $0.isKeyWindow })
        ?? UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first
    }

    private func configureAppearance(for window: UIWindow) {
        // Configure window appearance based on system settings
        if #available(iOS 13.0, *) {
            // Use system colors that respond to light/dark mode
            window.overrideUserInterfaceStyle = .unspecified // Follow system
        }

        window.backgroundColor = .black

        // Configure navigation bar appearance
        let navigationBarAppearance = UINavigationBarAppearance()
        navigationBarAppearance.configureWithTransparentBackground()
        navigationBarAppearance.backgroundColor = .clear
        navigationBarAppearance.shadowColor = .clear
        UINavigationBar.appearance().standardAppearance = navigationBarAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navigationBarAppearance
        UINavigationBar.appearance().compactAppearance = navigationBarAppearance

        // Configure tab bar appearance
        let tabBarAppearance = UITabBarAppearance()
        tabBarAppearance.configureWithTransparentBackground()
        tabBarAppearance.backgroundColor = .clear
        tabBarAppearance.shadowColor = .clear
        UITabBar.appearance().standardAppearance = tabBarAppearance
        if #available(iOS 15.0, *) {
            UITabBar.appearance().scrollEdgeAppearance = tabBarAppearance
        }
    }

    private func setupLayoutGuides(for window: UIWindow) {
        window.insetsLayoutMarginsFromSafeArea = false
        window.layoutMargins = .zero

        window.rootViewController?.view.insetsLayoutMarginsFromSafeArea = false
        window.rootViewController?.viewRespectsSystemMinimumLayoutMargins = false
        window.rootViewController?.additionalSafeAreaInsets = .zero

        if let root = window.rootViewController {
            applyEdgeToEdgeLayout(to: root)
        }
    }

    private func applyEdgeToEdgeLayout(for window: UIWindow) {
        window.insetsLayoutMarginsFromSafeArea = false
        window.layoutMargins = .zero

        if let root = window.rootViewController {
            applyEdgeToEdgeLayout(to: root)
        }
    }

    private func applyEdgeToEdgeLayout(to controller: UIViewController) {
        controller.additionalSafeAreaInsets = .zero
        controller.edgesForExtendedLayout = [.top, .bottom, .left, .right]
        controller.extendedLayoutIncludesOpaqueBars = true
        controller.view.insetsLayoutMarginsFromSafeArea = false
        controller.viewRespectsSystemMinimumLayoutMargins = false

        for child in controller.children {
            applyEdgeToEdgeLayout(to: child)
        }

        if let presented = controller.presentedViewController {
            applyEdgeToEdgeLayout(to: presented)
        }
    }
}
#endif

