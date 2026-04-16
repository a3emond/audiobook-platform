import SwiftUI

/*
 Purpose:
 Scene-level task handlers and sheet bindings for AudiobookApp.

 Why separate file:
 Keeps root scene composition concise while lifecycle/task behaviors stay explicit.
*/
extension AudiobookApp {
    // MARK: Sheet Bindings

    var seriesDetailSheetBinding: Binding<Bool> {
        Binding(
            get: { container.libraryViewModel.state.selectedSeriesName != nil },
            set: { isPresented in
                if !isPresented {
                    container.libraryViewModel.clearSeriesDetail()
                }
            }
        )
    }

    // MARK: Scene Tasks

    func handleAuthStateTask() async {
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

    func handleActiveBookDebugTask() {
        guard let activeBookId = container.playerViewModel.miniPlayerBookId() else { return }
        container.libraryViewModel.debugProgressSnapshot(for: activeBookId, source: "app.activeBook.changed")
    }
}
