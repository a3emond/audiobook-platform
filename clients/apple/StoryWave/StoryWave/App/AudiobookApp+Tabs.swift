import SwiftUI
import AudiobookCore

/*
 Purpose:
 Tab shell composition and auth reset flow for AudiobookApp.

 Why separate file:
 Keeps root app scene lightweight while tab/navigation wiring stays grouped here.
*/
extension AudiobookApp {
    // MARK: Shell Composition

    @ViewBuilder
    var tabsWithMiniPlayer: some View {
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

    // MARK: Tabs

    @ViewBuilder
    var tabsView: some View {
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

    func signOutAndReset() async {
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
