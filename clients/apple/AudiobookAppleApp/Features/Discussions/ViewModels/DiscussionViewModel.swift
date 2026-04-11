import SwiftUI
import AudiobookCore

@MainActor
final class DiscussionViewModel: ObservableObject {
    @Published private(set) var state = DiscussionState()
    @Published var eventMessage: String?

    private let repository: DiscussionRepository

    init(repository: DiscussionRepository) {
        self.repository = repository
    }

    func loadChannels() async {
        state.isLoading = true
        state.errorMessage = nil

        do {
            let channels = try await repository.listChannels()
            state.channels = channels
            if !channels.isEmpty {
                state.selectedChannelId = channels[0].id
                await loadMessages(channelId: channels[0].id)
            }
            state.isLoading = false
        } catch {
            state.errorMessage = error.localizedDescription
            state.isLoading = false
        }
    }

    func loadMessages(channelId: String) async {
        state.isLoadingMessages = true

        do {
            let messages = try await repository.listMessages(channelId: channelId)
            state.messages = messages
            state.isLoadingMessages = false
        } catch {
            state.isLoadingMessages = false
        }
    }

    func sendMessage(channelId: String, text: String) async {
        guard !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }

        do {
            let message = try await repository.postMessage(channelId: channelId, text: text)
            state.messages.append(message)
            state.messageInput = ""
        } catch {
            state.errorMessage = error.localizedDescription
        }
    }

    func selectChannel(_ channelId: String) async {
        state.selectedChannelId = channelId
        await loadMessages(channelId: channelId)
    }
}

struct DiscussionState: Equatable {
    var isLoading: Bool = false
    var isLoadingMessages: Bool = false
    var channels: [DiscussionChannelDTO] = []
    var messages: [DiscussionMessageDTO] = []
    var selectedChannelId: String?
    var messageInput: String = ""
    var errorMessage: String?
}
