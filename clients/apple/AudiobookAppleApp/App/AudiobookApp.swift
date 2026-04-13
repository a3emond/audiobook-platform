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
                Branding.backgroundGradient.ignoresSafeArea()
                Group {
                    if !bootstrap.initialized {
                        AppSplashView()
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
                        PlayerView(viewModel: container.playerViewModel) {
                            selectedBookId = nil
                            container.playerViewModel.reset()
                        }
                    } else {
                        tabsView
                    }
                }
            }
            .foregroundStyle(Branding.text)
            .task {
                async let initTask: Void = bootstrap.initialize()
                async let healthTask: Void = connectivity.checkNow()
                _ = await (initTask, healthTask)
            }
        }
    }

    @ViewBuilder
    private var tabsView: some View {
        TabView(selection: $selectedTab) {
            LibraryView(
                viewModel: container.libraryViewModel,
                onOpenBook: { bookId, title in
                    selectedBookId = bookId
                    Task { await container.playerViewModel.load(bookId: bookId, title: title) }
                },
                onSignOut: { signOutAndReset() }
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

            ProfileView(viewModel: container.profileViewModel)
                .tag(AppTab.profile)
                .tabItem {
                    Label("Profile", systemImage: "person")
                }

            #if os(macOS)
            AdminView(viewModel: container.adminViewModel)
                .tag(AppTab.admin)
                .tabItem {
                    Label("Admin", systemImage: "person.3.sequence")
                }
            #endif
        }
    }

    private func signOutAndReset() {
        container.authViewModel.signOut()
        container.libraryViewModel.reset()
        container.playerViewModel.reset()
        selectedBookId = nil
    }

    private static func resolveGatewayURL() -> URL {
        if let configured = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
           let url = URL(string: configured),
           !configured.isEmpty {
            return url
        }

        return URL(string: "https://audiobook.aedev.pro")!
    }
}
