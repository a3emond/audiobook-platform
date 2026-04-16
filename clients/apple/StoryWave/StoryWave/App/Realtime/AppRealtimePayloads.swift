import Foundation
import AudiobookCore

/*
 Purpose:
 Decodable payload shapes for realtime events consumed by AppContainer.

 Why separate file:
 Keeping event models out of AppContainer helps keep orchestration code focused on wiring
 and dispatch logic.
*/
struct RealtimeDiscussionCreatedPayload: Decodable {
    let message: DiscussionMessageDTO?
}

struct RealtimeDiscussionDeletedPayload: Decodable {
    let messageId: String?
    let lang: String?
    let channelKey: String?
}

struct RealtimeJobStateChangedPayload: Decodable {
    let job: AdminJobDTO?
}

struct RealtimeProgressSyncedPayload: Decodable {
    let bookId: String?
    let positionSeconds: Int?
    let durationAtSave: Int?
    let completed: Bool?
    let timestamp: String?
}
