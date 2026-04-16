import SwiftUI
import AudiobookCore

/*
 Purpose:
 Root SwiftUI app entry point and shell coordinator.

 Responsibilities:
 - Resolve and initialize the app container.
 - Coordinate authentication, health checks, and bootstrap state.
 - Route between shell tabs and full-screen player presentation.
*/
@main
struct AudiobookApp: App {
    // MARK: Root State

    @StateObject private var bootstrap: AppBootstrap
    @StateObject private var connectivity: APIReachabilityViewModel
    @StateObject private var container: AppContainer
    @State private var selectedBookId: String?
    @State private var selectedTab: AppTab = .library

    // MARK: Init

    init() {
        let gatewayBaseURL = AppGatewayConfiguration.resolveGatewayURL()
        let container = AppContainer(baseURL: gatewayBaseURL)

        _container = StateObject(wrappedValue: container)
        _bootstrap = StateObject(wrappedValue: AppBootstrap())
        _connectivity = StateObject(wrappedValue: APIReachabilityViewModel(apiClient: container.apiClient))
    }

    // MARK: App Scene

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
                                },
                                onOpenSeries: { seriesName in
                                    Task { await container.libraryViewModel.showSeriesDetail(name: seriesName) }
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
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
#if os(iOS)
                .ignoresSafeArea()
#endif
                .foregroundStyle(Branding.text)
                .task {
                    async let initTask: Void = bootstrap.initialize()
                    async let healthTask: Void = connectivity.checkNow()
                    _ = await (initTask, healthTask)
                }
                .task(id: container.authViewModel.state.isAuthenticated) {
                    container.setRealtimeLifecycleActive(container.authViewModel.state.isAuthenticated)

                    if container.authViewModel.state.isAuthenticated,
                       container.profileViewModel.user == nil,
                       !container.profileViewModel.isLoading {
                        await container.profileViewModel.load()
                    }

                    if container.authViewModel.state.isAuthenticated {
                        container.playerViewModel.broadcastPresence()
                    }
                }
                .task(id: container.playerViewModel.miniPlayerBookId() ?? "") {
                    guard let activeBookId = container.playerViewModel.miniPlayerBookId() else { return }
                    container.libraryViewModel.debugProgressSnapshot(for: activeBookId, source: "app.activeBook.changed")
                }
                .sheet(isPresented: Binding(
                    get: { container.libraryViewModel.state.selectedSeriesName != nil },
                    set: { isPresented in
                        if !isPresented {
                            container.libraryViewModel.clearSeriesDetail()
                        }
                    }
                )) {
                    SeriesDetailPageView(
                        seriesName: container.libraryViewModel.state.selectedSeriesName ?? "Series",
                        books: container.libraryViewModel.state.selectedSeriesBooks,
                        progressSnapshot: container.libraryViewModel.seriesProgress(for: container.libraryViewModel.state.selectedSeriesBooks),
                        coverURLForBook: { container.libraryViewModel.coverURL(for: $0) },
                        progressPercentForBookId: { container.libraryViewModel.progressPercent(for: $0) },
                        isCompletedForBookId: { container.libraryViewModel.isCompleted(for: $0) },
                        isAdmin: container.profileViewModel.user?.role == "admin",
                        onOpenBook: { bookId, title in
                            container.libraryViewModel.clearSeriesDetail()
                            selectedBookId = bookId
                            Task { await container.playerViewModel.load(bookId: bookId, title: title) }
                        },
                        onEditBook: { bookId in
                            container.libraryViewModel.clearSeriesDetail()
                            selectedTab = .admin
                            Task { await container.adminViewModel.openBookEditor(bookId: bookId) }
                        },
                        onClose: {
                            container.libraryViewModel.clearSeriesDetail()
                        }
                    )
                }
#if os(iOS)
                .overlay(alignment: .top) {
                    if shouldShowRootPlaybackOverlay {
                        GeometryReader { proxy in
                            let safeTop = max(proxy.safeAreaInsets.top, container.windowingAdapter.topSafeAreaInset())
                            HStack {
                                Spacer(minLength: 0)
                                rootPlaybackOverlay
                                    .frame(maxWidth: rootPlaybackOverlayMaxWidth)
                            }
                                .padding(.top, max(safeTop, 0))
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                                .transition(.move(edge: .top).combined(with: .opacity))
                                .zIndex(40)
                        }
                    }
                }
#endif
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

    // MARK: Shell Composition

    @ViewBuilder
    private var tabsWithMiniPlayer: some View {
#if os(macOS)
        tabsView
            .safeAreaInset(edge: .top, alignment: .trailing, spacing: 0) {
                if shouldShowMacPlaybackDock {
                    miniPlayerDock
                        .frame(maxWidth: rootPlaybackOverlayMaxWidth)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
            .animation(.easeInOut(duration: 0.2), value: shouldShowMacPlaybackDock)
#else
        tabsView
            .animation(.easeInOut(duration: 0.2), value: shouldShowRootPlaybackOverlay)
#endif
    }

    // MARK: Playback Overlay

    @ViewBuilder
    private var rootPlaybackOverlay: some View {
        VStack(spacing: 0) {
#if os(iOS)
            if shouldShowIOSPlaybackBanner {
                iosPlaybackStatusBanner
            }
#endif
            if container.playerViewModel.miniPlayerIsVisible() {
                miniPlayerDock
            }
        }
        .background(Branding.surface.opacity(0.96))
        .overlay(
            Rectangle()
                .stroke(Branding.surfaceSoft, lineWidth: 1)
        )
    }

    // MARK: Overlay Views

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

    // MARK: Overlay Conditions

    private var shouldShowRootPlaybackOverlay: Bool {
#if os(iOS)
        selectedBookId == nil && (container.playerViewModel.miniPlayerIsVisible() || shouldShowIOSPlaybackBanner)
#else
        false
#endif
    }

        private var shouldShowMacPlaybackDock: Bool {
    #if os(macOS)
        selectedBookId == nil && container.playerViewModel.miniPlayerIsVisible()
    #else
        false
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

    // MARK: Tabs

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
    }

    // MARK: Auth Flow

    private func signOutAndReset() async {
        await container.authViewModel.signOut()
        container.setRealtimeLifecycleActive(false)
        container.libraryViewModel.reset()
        container.playerViewModel.reset()
        container.profileStatsViewModel.reset()
        container.profileSettingsViewModel.reset()
        selectedBookId = nil
        selectedTab = .library
    }
}

