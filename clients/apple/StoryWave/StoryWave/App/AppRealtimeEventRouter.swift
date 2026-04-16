import Foundation
import AudiobookCore

/*
 Purpose:
 Register and route realtime events to feature-level handlers.

 Why separate file:
 AppContainer should orchestrate dependencies, while this router encapsulates event wiring.
*/
enum AppRealtimeEventRouter {
    // MARK: Handlers

    struct Handlers {
        let onDiscussionMessageCreated: (DiscussionMessageDTO) -> Void
        let onDiscussionMessageDeleted: (_ messageId: String, _ lang: String, _ channelKey: String) -> Void
        let onAdminJobStateChanged: (AdminJobDTO) -> Void
        let onCatalogBookAdded: () -> Void
        let onProgressSynced: (_ bookId: String, _ positionSeconds: Int?, _ durationAtSave: Int?, _ completed: Bool?, _ timestamp: String?) -> Void
    }

    // MARK: Registration

    static func register(
        on realtimeClient: RealtimeClient,
        progressDebugEnabled: Bool,
        handlers: Handlers
    ) -> [UUID] {
        let discussionCreatedID = realtimeClient.subscribe { event in
            guard event.type == "discussion.message.created",
                  let payload = event.decodePayload(as: RealtimeDiscussionCreatedPayload.self),
                  let message = payload.message else {
                return
            }

            Task { @MainActor in
                handlers.onDiscussionMessageCreated(message)
            }
        }

        let discussionDeletedID = realtimeClient.subscribe { event in
            guard event.type == "discussion.message.deleted",
                  let payload = event.decodePayload(as: RealtimeDiscussionDeletedPayload.self),
                  let messageId = payload.messageId,
                  let lang = payload.lang,
                  let channelKey = payload.channelKey else {
                return
            }

            Task { @MainActor in
                handlers.onDiscussionMessageDeleted(messageId, lang, channelKey)
            }
        }

        let adminJobsID = realtimeClient.subscribe { event in
            guard event.type == "job.state.changed",
                  let payload = event.decodePayload(as: RealtimeJobStateChangedPayload.self),
                  let job = payload.job else {
                return
            }

            Task { @MainActor in
                handlers.onAdminJobStateChanged(job)
            }
        }

        let catalogAddedID = realtimeClient.subscribe { event in
            guard event.type == "catalog.book.added" else {
                return
            }

            Task { @MainActor in
                handlers.onCatalogBookAdded()
            }
        }

        let progressSyncedID = realtimeClient.subscribe { event in
            guard event.type == "progress.synced",
                  let payload = event.decodePayload(as: RealtimeProgressSyncedPayload.self),
                  let bookId = payload.bookId else {
                return
            }

            if progressDebugEnabled {
                print(
                    "[ProgressDebug][Realtime] progress.synced bookId=\(bookId) " +
                    "position=\(payload.positionSeconds.map(String.init) ?? "nil") " +
                    "duration=\(payload.durationAtSave.map(String.init) ?? "nil") " +
                    "completed=\(payload.completed.map { String($0) } ?? "nil") " +
                    "timestamp=\(payload.timestamp ?? "nil")"
                )
            }

            Task { @MainActor in
                handlers.onProgressSynced(
                    bookId,
                    payload.positionSeconds,
                    payload.durationAtSave,
                    payload.completed,
                    payload.timestamp
                )
            }
        }

        return [
            discussionCreatedID,
            discussionDeletedID,
            adminJobsID,
            catalogAddedID,
            progressSyncedID,
        ]
    }
}
