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

    @Environment(\.scenePhase) private var scenePhase

    // Intentionally internal so cross-file extensions can organize shell responsibilities.
    @StateObject var bootstrap: AppBootstrap
    @StateObject var connectivity: APIReachabilityViewModel
    @StateObject var container: AppContainer
    @State var selectedBookId: String?
    @State var selectedTab: AppTab = .library

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
                    rootScreen
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
                    await handleAuthStateTask()
                }
                .task(id: scenePhase) {
                    await handleScenePhaseTask(scenePhase)
                }
                .task(id: container.playerViewModel.miniPlayerBookId() ?? "") {
                    handleActiveBookDebugTask()
                }
                .sheet(isPresented: seriesDetailSheetBinding) {
                    seriesDetailSheet
                }
#if os(iOS)
                .overlay(alignment: .bottom) {
                    IOSPlaybackBar(
                        playerViewModel: container.playerViewModel,
                        selectedBookId: selectedBookId,
                        onOpen: { bookId, title in
                            selectedBookId = bookId
                            if container.playerViewModel.state.bookId != bookId {
                                Task { await container.playerViewModel.load(bookId: bookId, title: title) }
                            }
                        },
                        onClose: { container.playerViewModel.reset() }
                    )
                }
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
}

