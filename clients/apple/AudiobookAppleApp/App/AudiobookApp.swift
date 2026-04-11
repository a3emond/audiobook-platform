import SwiftUI
import AudiobookCore

@main
struct AudiobookApp: App {
    @StateObject private var bootstrap: AppBootstrap
    @StateObject private var connectivity: APIReachabilityViewModel
    @StateObject private var authViewModel: AuthViewModel
    @StateObject private var libraryViewModel: LibraryViewModel
    @StateObject private var playerViewModel: PlayerViewModel
    @StateObject private var discussionViewModel: DiscussionViewModel
    @StateObject private var profileViewModel: ProfileViewModel
    @State private var selectedBookId: String?
    @State private var selectedTab: AppTab = .library

    enum AppTab {
        case library
        case discussions
        case profile
    }

    init() {
        let gatewayBaseURL = URL(string: "https://audiobook.aedev.pro")!
        let apiClient = APIClient(baseURL: gatewayBaseURL)
        let sessionManager = AuthSessionManager()
        let authService = AuthService(apiClient: apiClient, sessionManager: sessionManager)
        let libraryRepository = LibraryRepository(authService: authService)
        let playerRepository = PlayerRepository(authService: authService, apiClient: apiClient)
        let discussionRepository = DiscussionRepositoryImpl(authService: authService)
        let realtimeClient = RealtimeClient(baseURL: gatewayBaseURL)
        
        _bootstrap = StateObject(wrappedValue: AppBootstrap())
        _connectivity = StateObject(wrappedValue: APIReachabilityViewModel(apiClient: apiClient))
        _authViewModel = StateObject(wrappedValue: AuthViewModel(authService: authService))
        _libraryViewModel = StateObject(wrappedValue: LibraryViewModel(repository: libraryRepository))
        _playerViewModel = StateObject(wrappedValue: PlayerViewModel(repository: playerRepository, authService: authService, realtime: realtimeClient))
        _discussionViewModel = StateObject(wrappedValue: DiscussionViewModel(repository: discussionRepository))
        _profileViewModel = StateObject(wrappedValue: ProfileViewModel(authService: authService))
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
                    } else if !authViewModel.state.isAuthenticated {
                        LoginView(viewModel: authViewModel)
                    } else if selectedBookId != nil {
                        PlayerView(viewModel: playerViewModel) {
                            selectedBookId = nil
                            playerViewModel.reset()
                        }
                    } else {
                        TabView(selection: $selectedTab) {
                            // Library tab
                            LibraryView(
                                viewModel: libraryViewModel,
                                onOpenBook: { bookId, title in
                                    selectedBookId = bookId
                                    Task { await playerViewModel.load(bookId: bookId, title: title) }
                                },
                                onSignOut: {
                                    authViewModel.signOut()
                                    libraryViewModel.reset()
                                    playerViewModel.reset()
                                    selectedBookId = nil
                                }
                            )
                            .tag(AppTab.library)
                            .tabItem {
                                Label("Library", systemImage: "books.vertical")
                            }

                            // Discussions tab
                            DiscussionView(viewModel: discussionViewModel)
                                .tag(AppTab.discussions)
                                .tabItem {
                                    Label("Discussions", systemImage: "bubble.left.and.bubble.right")
                                }

                            // Profile tab
                            ProfileView(viewModel: profileViewModel)
                                .tag(AppTab.profile)
                                .tabItem {
                                    Label("Profile", systemImage: "person")
                                }
                        }
                        .onChangeCompat(of: selectedTab) { _ in
                            // Reset selections when switching tabs if needed
                        }
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
}

// Compatibility for onChange across Swift versions
extension View {
    @ViewBuilder
    func onChangeCompat<V: Equatable>(of value: V, perform action: @escaping (V) -> Void) -> some View {
        if #available(iOS 17.0, macOS 14.0, *) {
            self.onChange(of: value, perform: action)
        } else {
            self.onChange(of: value) { action($0) }
        }
    }
}
