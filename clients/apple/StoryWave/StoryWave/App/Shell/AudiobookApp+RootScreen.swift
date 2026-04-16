import SwiftUI
import AudiobookCore

/*
 Purpose:
 Root screen routing for app startup/auth/player/tab shell states.

 Why separate file:
 Keeps scene composition in AudiobookApp readable while state-driven route selection
 is grouped in one focused place.
*/
extension AudiobookApp {
    // MARK: Root Screen Routing

    @ViewBuilder
    var rootScreen: some View {
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
    }

    // MARK: Sheets

    var seriesDetailSheet: some View {
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
}
