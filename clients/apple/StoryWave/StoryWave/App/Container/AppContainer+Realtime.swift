import Foundation
import AudiobookCore

/*
 Purpose:
 Realtime lifecycle and event routing for AppContainer.

 Why separate file:
 Keeps container lifecycle concerns separate from object graph assembly and UI shell wiring.
*/
extension AppContainer {
    // MARK: Realtime Lifecycle

    func setRealtimeLifecycleActive(_ isActive: Bool) {
        guard isRealtimeLifecycleActive != isActive else { return }
        isRealtimeLifecycleActive = isActive

        if isActive {
            realtimeClient.connect()
        } else {
            realtimeClient.disconnect()
        }
    }

    // MARK: Realtime Routing

    func configureRealtimeEventRouting() {
        realtimeSubscriptionIDs = AppRealtimeEventRouter.register(
            on: realtimeClient,
            progressDebugEnabled: progressDebugEnabled,
            handlers: .init(
                onDiscussionMessageCreated: { [weak self] message in
                    self?.discussionViewModel.applyRealtimeMessageCreated(message)
                },
                onDiscussionMessageDeleted: { [weak self] messageId, lang, channelKey in
                    self?.discussionViewModel.applyRealtimeMessageDeleted(
                        messageId: messageId,
                        lang: lang,
                        channelKey: channelKey
                    )
                },
                onAdminJobStateChanged: { [weak self] job in
                    self?.adminViewModel.applyRealtimeJobUpdate(job)
                },
                onCatalogBookAdded: { [weak self] in
                    self?.appCacheService.invalidateLibrary()
                },
                onProgressSynced: { [weak self] bookId, positionSeconds, durationAtSave, completed, timestamp in
                    guard let self else { return }
                    Task { @MainActor in
                        await self.libraryViewModel.applyRealtimeProgressSync(
                            bookId: bookId,
                            positionSeconds: positionSeconds,
                            durationAtSave: durationAtSave,
                            completed: completed,
                            timestamp: timestamp
                        )
                        if self.progressDebugEnabled {
                            self.libraryViewModel.debugProgressSnapshot(for: bookId, source: "realtime.progress.synced")
                        }
                    }
                }
            )
        )
    }
}
