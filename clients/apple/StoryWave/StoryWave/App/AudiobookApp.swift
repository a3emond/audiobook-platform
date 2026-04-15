import SwiftUI
import AudiobookCore
#if os(iOS)
import UIKit
#endif

@main
struct AudiobookApp: App {
    @StateObject private var bootstrap: AppBootstrap
    @StateObject private var connectivity: APIReachabilityViewModel
    @StateObject private var container: AppContainer
    @State private var selectedBookId: String?
    @State private var selectedTab: AppTab = .library

    enum AppTab: Hashable {
        case library
        case discussions
        case profile
        case admin
    }

    init() {
        let gatewayBaseURL = Self.resolveGatewayURL()
        let container = AppContainer(baseURL: gatewayBaseURL)

        _container = StateObject(wrappedValue: container)
        _bootstrap = StateObject(wrappedValue: AppBootstrap())
        _connectivity = StateObject(wrappedValue: APIReachabilityViewModel(apiClient: container.apiClient))
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
#if os(iOS)
                EdgeToEdgeRootForcer()
                    .frame(width: 0, height: 0)
#endif
                ZStack(alignment: .top) {
                    Color.clear.ignoresSafeArea()
                    Branding.layeredBackground.ignoresSafeArea()
                    Group {
                        if !bootstrap.initialized {
                            AppSplashView(message: bootstrap.statusMessage)
                        } else if connectivity.isChecking {
                            APIHealthGateView(
                                isChecking: true,
                                message: "Checking API reachability...",
                                onRetry: {}
                            )
                        } else if !connectivity.isReachable {
                            APIHealthGateView(
                                isChecking: false,
                                message: connectivity.message,
                                onRetry: {
                                    Task { await connectivity.checkNow() }
                                }
                            )
                        } else if !container.authViewModel.state.isAuthenticated {
                            LoginView(viewModel: container.authViewModel)
                        } else if selectedBookId != nil {
                            PlayerView(
                                viewModel: container.playerViewModel,
                                isAdmin: container.profileViewModel.user?.role == "admin",
                                onEditMetadata: {
                                    let bookId = container.playerViewModel.state.bookId
                                    selectedBookId = nil
                                    selectedTab = .admin
                                    Task { await container.adminViewModel.openBookEditor(bookId: bookId) }
                                }
                            ) {
                                selectedBookId = nil
                            }
                        } else {
                            tabsWithMiniPlayer
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
#if os(iOS)
                    .ignoresSafeArea()
#endif
                    .logSize("Content Group")
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
#if os(iOS)
                .ignoresSafeArea()
#endif
                .logSize("Root ZStack")
                .foregroundStyle(Branding.text)
                .task {
#if os(iOS)
                    let screenBounds = UIScreen.main.bounds
                    let keyWindow = UIApplication.shared.connectedScenes
                        .compactMap { $0 as? UIWindowScene }
                        .flatMap(\.windows)
                        .first(where: \.isKeyWindow)
                    let safeInsets = keyWindow?.safeAreaInsets ?? .zero
                    print("[LOG] Screen bounds: \(screenBounds), keyWindow safeAreaInsets: \(safeInsets)")
#endif
                    async let initTask: Void = bootstrap.initialize()
                    async let healthTask: Void = connectivity.checkNow()
                    _ = await (initTask, healthTask)
                }
                .task(id: container.authViewModel.state.isAuthenticated) {
                    print("[LOG] isAuthenticated changed: \(container.authViewModel.state.isAuthenticated)")
                    if container.authViewModel.state.isAuthenticated,
                       container.profileViewModel.user == nil,
                       !container.profileViewModel.isLoading {
                        await container.profileViewModel.load()
                    }

                    if container.authViewModel.state.isAuthenticated {
                        container.playerViewModel.broadcastPresence()
                    }
                }
                .overlay(alignment: .top) {
                    if shouldShowRootPlaybackOverlay {
                        GeometryReader { proxy in
                            let safeTop = max(proxy.safeAreaInsets.top, effectiveIOSTopInset())
                            HStack {
                                Spacer(minLength: 0)
                                rootPlaybackOverlay
                                    .frame(maxWidth: rootPlaybackOverlayMaxWidth)
                            }
                                .padding(.horizontal, 12)
                                .padding(.top, max(safeTop + miniPlayerTopInsetSpacing, 8))
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                                .transition(.move(edge: .top).combined(with: .opacity))
                                .zIndex(40)
                        }
                    }
                }
#if os(iOS)
                .overlay(alignment: .top) {
                    GeometryReader { proxy in
                        Color.black
                            .frame(height: proxy.safeAreaInsets.top)
                            .frame(maxWidth: .infinity, alignment: .top)
                            .ignoresSafeArea(edges: .top)
                    }
                    .allowsHitTesting(false)
                }
#endif
            }
#if os(iOS)
            .ignoresSafeArea()
#endif
        }
#if os(macOS)
    .windowStyle(HiddenTitleBarWindowStyle())
        .defaultSize(width: 1240, height: 900)
#endif
    }

    @ViewBuilder
    private var tabsWithMiniPlayer: some View {
        tabsView
            .animation(.easeInOut(duration: 0.2), value: shouldShowRootPlaybackOverlay)
    }

    @ViewBuilder
    private var rootPlaybackOverlay: some View {
#if os(iOS)
        iosPlaybackStatusBanner
#else
        miniPlayerDock
#endif
    }

    private var miniPlayerDock: some View {
        MiniPlayerBarView(
            viewModel: container.playerViewModel,
            onOpenFullPlayer: {
                guard let targetBookId = container.playerViewModel.miniPlayerBookId() else { return }
                selectedBookId = targetBookId
                if container.playerViewModel.state.bookId != targetBookId {
                    let targetTitle = container.playerViewModel.miniPlayerTitle()
                    Task { await container.playerViewModel.load(bookId: targetBookId, title: targetTitle) }
                }
            },
            onClose: { container.playerViewModel.reset() }
        )
    }

#if os(iOS)
    private var iosPlaybackStatusBanner: some View {
        let state = container.playerViewModel.state

        return HStack(spacing: 10) {
            Circle()
                .fill(Color.orange)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 2) {
                Text("Playing on \(state.activeDeviceLabel ?? "another device")")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .lineLimit(1)

                Text(state.remoteTitle ?? (state.title.isEmpty ? "Active playback" : state.title))
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Branding.text)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            if state.isRemotePlaybackActive {
                Button("Take Control") {
                    container.playerViewModel.listenHereFromMiniPlayer()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }

            Button("Open") {
                openActivePlaybackFromOverlay()
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Branding.surface.opacity(0.96))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Branding.surfaceSoft, lineWidth: 1)
        )
    }
#endif

    private var rootPlaybackOverlayMaxWidth: CGFloat {
#if os(iOS)
        340
#else
        420
#endif
    }

    private var miniPlayerTopInsetSpacing: CGFloat {
#if os(iOS)
        6
#else
        8
#endif
    }

    private func effectiveIOSTopInset() -> CGFloat {
#if os(iOS)
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: { $0.isKeyWindow })?
            .safeAreaInsets.top ?? 0
#else
        0
#endif
    }

    private var shouldShowRootPlaybackOverlay: Bool {
#if os(iOS)
        selectedBookId == nil && shouldShowIOSPlaybackBanner
#else
        selectedBookId == nil && container.playerViewModel.miniPlayerIsVisible()
#endif
    }

    private var shouldShowIOSPlaybackBanner: Bool {
#if os(iOS)
        let state = container.playerViewModel.state
        return state.isRemotePlaybackActive
            || !(state.activeDeviceLabel ?? "").isEmpty
            || !(state.remoteBookId ?? "").isEmpty
            || !(state.remoteTitle ?? "").isEmpty
#else
        false
#endif
    }

    private func openActivePlaybackFromOverlay() {
        guard let targetBookId = container.playerViewModel.miniPlayerBookId() else { return }
        selectedBookId = targetBookId
        if container.playerViewModel.state.bookId != targetBookId {
            let targetTitle = container.playerViewModel.state.remoteTitle
                ?? container.playerViewModel.miniPlayerTitle()
            Task { await container.playerViewModel.load(bookId: targetBookId, title: targetTitle) }
        }
    }

    @ViewBuilder
    private var tabsView: some View {
        TabView(selection: $selectedTab) {
            LibraryView(
                viewModel: container.libraryViewModel,
                isAdmin: container.profileViewModel.user?.role == "admin",
                onOpenBook: { bookId, title in
                    selectedBookId = bookId
                    Task { await container.playerViewModel.load(bookId: bookId, title: title) }
                },
                onEditBook: { bookId in
                    selectedTab = .admin
                    Task { await container.adminViewModel.openBookEditor(bookId: bookId) }
                },
                onSignOut: { await signOutAndReset() }
            )
#if os(iOS)
            .ignoresSafeArea(.container, edges: [.leading, .trailing])
#endif
            .tag(AppTab.library)
            .tabItem {
                Label("Library", systemImage: "books.vertical")
            }

            DiscussionView(
                viewModel: container.discussionViewModel,
                isAdmin: container.profileViewModel.user?.role == "admin"
            )
#if os(iOS)
                .ignoresSafeArea(.container, edges: [.leading, .trailing])
#endif
                .tag(AppTab.discussions)
                .tabItem {
                    Label("Discussions", systemImage: "bubble.left.and.bubble.right")
                }

            ProfileView(
                viewModel: container.profileViewModel,
                statsViewModel: container.profileStatsViewModel,
                settingsViewModel: container.profileSettingsViewModel,
                onSignOut: { await signOutAndReset() }
            )
#if os(iOS)
                .ignoresSafeArea(.container, edges: [.leading, .trailing])
#endif
                .tag(AppTab.profile)
                .tabItem {
                    Label("Profile", systemImage: "person")
                }

            if container.profileViewModel.user?.role == "admin" {
                AdminView(viewModel: container.adminViewModel)
#if os(iOS)
                    .ignoresSafeArea(.container, edges: [.leading, .trailing])
#endif
                    .tag(AppTab.admin)
                    .tabItem {
                        Label("Admin", systemImage: "person.3.sequence")
                    }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.clear)
#if os(iOS)
    .ignoresSafeArea(edges: [.top, .bottom, .leading, .trailing])
#endif
#if os(iOS)
        .ignoresSafeArea(.keyboard)
#endif
        .logSize("TabView")
    }

    private func signOutAndReset() async {
        await container.authViewModel.signOut()
        container.libraryViewModel.reset()
        container.playerViewModel.reset()
        container.profileStatsViewModel.reset()
        container.profileSettingsViewModel.reset()
        selectedBookId = nil
        selectedTab = .library
    }

    private static func resolveGatewayURL() -> URL {
        if let configured = ProcessInfo.processInfo.environment["API_BASE_URL"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !configured.isEmpty,
           let url = URL(string: configured) {
            return url
        }

        if let configured = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
           !configured.isEmpty,
           let url = URL(string: configured) {
            return url
        }

        return URL(string: "https://audiobook.aedev.pro")!
    }
}

private extension View {
    func logSize(_ label: String) -> some View {
        self.overlay(
            GeometryReader { proxy in
                Color.clear
                    .onAppear {
                        print("[LOG] \(label) size: \(proxy.size), safeAreaInsets: \(proxy.safeAreaInsets)")
                    }
                    .onChange(of: proxy.size) { newValue in
                        print("[LOG] \(label) size changed: \(newValue), safeAreaInsets: \(proxy.safeAreaInsets)")
                    }
            }
        )
    }
}

#if os(iOS)
private struct EdgeToEdgeRootForcer: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        Controller()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}

    private final class Controller: UIViewController {
        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            applyEdgeToEdgeIfPossible()
        }

        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            applyEdgeToEdgeIfPossible()
        }

        private func applyEdgeToEdgeIfPossible() {
            guard let window = view.window else { return }

            window.insetsLayoutMarginsFromSafeArea = false
            window.layoutMargins = .zero

            if let root = window.rootViewController {
                applyEdgeToEdge(to: root)
            }
        }

        private func applyEdgeToEdge(to controller: UIViewController) {
            controller.additionalSafeAreaInsets = .zero
            controller.edgesForExtendedLayout = [.top, .bottom, .left, .right]
            controller.extendedLayoutIncludesOpaqueBars = true
            controller.view.insetsLayoutMarginsFromSafeArea = false
            controller.viewRespectsSystemMinimumLayoutMargins = false

            for child in controller.children {
                applyEdgeToEdge(to: child)
            }

            if let presented = controller.presentedViewController {
                applyEdgeToEdge(to: presented)
            }
        }
    }
}
#endif

