import SwiftUI
import AudiobookCore

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
            }
            .foregroundStyle(Branding.text)
            .task {
                async let initTask: Void = bootstrap.initialize()
                async let healthTask: Void = connectivity.checkNow()
                _ = await (initTask, healthTask)
            }
            .task(id: container.authViewModel.state.isAuthenticated) {
                if container.authViewModel.state.isAuthenticated,
                   container.profileViewModel.user == nil,
                   !container.profileViewModel.isLoading {
                    await container.profileViewModel.load()
                }

                if container.authViewModel.state.isAuthenticated {
                    container.playerViewModel.broadcastPresence()
                }
            }
        }
        #if os(macOS)
        .defaultSize(width: 1240, height: 900)
        #endif
    }

    @ViewBuilder
    private var tabsWithMiniPlayer: some View {
        tabsView
            .safeAreaInset(edge: .top, spacing: 8) {
                if shouldShowMiniPlayer {
                    MiniPlayerBarView(
                        viewModel: container.playerViewModel,
                        onOpenFullPlayer: {
                            guard let targetBookId = container.playerViewModel.miniPlayerBookId() else { return }
                            selectedBookId = targetBookId

                            if container.playerViewModel.state.bookId != targetBookId {
                                let targetTitle = container.playerViewModel.miniPlayerTitle()
                                Task {
                                    await container.playerViewModel.load(bookId: targetBookId, title: targetTitle)
                                }
                            }
                        },
                        onClose: {
                            container.playerViewModel.reset()
                        }
                    )
                    .padding(.horizontal, 12)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        .animation(.easeInOut(duration: 0.2), value: shouldShowMiniPlayer)
    }

    private var shouldShowMiniPlayer: Bool {
        selectedBookId == nil && container.playerViewModel.miniPlayerIsVisible()
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
            .tag(AppTab.library)
            .tabItem {
                Label("Library", systemImage: "books.vertical")
            }

            DiscussionView(viewModel: container.discussionViewModel)
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
                .tag(AppTab.profile)
                .tabItem {
                    Label("Profile", systemImage: "person")
                }

            if container.profileViewModel.user?.role == "admin" {
                AdminView(viewModel: container.adminViewModel)
                    .tag(AppTab.admin)
                    .tabItem {
                        Label("Admin", systemImage: "person.3.sequence")
                    }
            }
        }
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

