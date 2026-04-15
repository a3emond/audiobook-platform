import SwiftUI
import AudiobookCore
import Combine

@MainActor
final class DiscussionViewModel: ObservableObject {
    @Published private(set) var state = DiscussionState()
    @Published var messageInput: String = ""
    @Published var newChannelTitle: String = ""
    @Published var newChannelDescription: String = ""
    @Published var newChannelKey: String = ""
    @Published private(set) var statusMessage: String?
    @Published private(set) var replyingToMessageId: String?

    private let repository: DiscussionRepository
    private let appCacheService: AppCacheService
    private let localization = LocalizationService.shared
    private var cancellables = Set<AnyCancellable>()
    private var channelsCache: (timestamp: Date, locale: String, channels: [DiscussionChannelDTO])?
    private var messagesCache: [String: MessageCacheEntry] = [:]
    private let cacheTTL: TimeInterval = 60
    private let defaultChannelKeys: Set<String> = ["general", "book-requests", "series-talk", "recommendations"]

    private struct MessageCacheEntry {
        let timestamp: Date
        let locale: String
        let messages: [DiscussionMessageDTO]
        let hasMore: Bool
    }

    init(repository: DiscussionRepository, appCacheService: AppCacheService) {
        self.repository = repository
        self.appCacheService = appCacheService

        appCacheService.invalidationPublisher
            .sink { [weak self] event in
                guard let self else { return }
                switch event {
                case .all, .library:
                    self.channelsCache = nil
                    self.messagesCache.removeAll()
                case .book:
                    break
                }
            }
            .store(in: &cancellables)
    }

    func loadChannels() async {
        if let cached = channelsCache,
           cached.locale == localization.locale,
           Date().timeIntervalSince(cached.timestamp) <= cacheTTL {
            state.channels = cached.channels
            if let selected = state.selectedChannelId,
               cached.channels.contains(where: { $0.id == selected }) {
                await loadMessages(channelId: selected)
            } else if let first = cached.channels.first {
                state.selectedChannelId = first.id
                await loadMessages(channelId: first.id)
            }
            return
        }

        state.isLoading = true
        state.errorMessage = nil
        statusMessage = nil

        do {
            let channels = try await repository.listChannels(language: localization.locale)
            state.channels = channels
            channelsCache = (Date(), localization.locale, channels)
            if !channels.isEmpty {
                state.selectedChannelId = channels[0].id
                await loadMessages(channelId: channels[0].id)
            }
            state.isLoading = false
        } catch {
            state.errorMessage = "Failed to load channels: \(error.localizedDescription)"
            state.isLoading = false
        }
    }

    func loadMessages(channelId: String, before: String? = nil) async {
        let cacheKey = cacheKeyForMessages(channelId: channelId)
        if before == nil,
           let cached = messagesCache[cacheKey],
           cached.locale == localization.locale,
           Date().timeIntervalSince(cached.timestamp) <= cacheTTL {
            state.messages = cached.messages
            state.hasMoreMessages = cached.hasMore
            return
        }

        if before == nil {
            state.isLoadingMessages = true
        } else {
            state.isLoadingOlderMessages = true
        }
        state.errorMessage = nil

        do {
            let response = try await repository.listMessages(
                channelId: channelId,
                language: localization.locale,
                limit: 80,
                before: before
            )

            if let before {
                if !before.isEmpty {
                    state.messages = response.messages + state.messages
                }
            } else {
                state.messages = response.messages
            }

            state.hasMoreMessages = response.hasMore
            messagesCache[cacheKey] = MessageCacheEntry(
                timestamp: Date(),
                locale: localization.locale,
                messages: state.messages,
                hasMore: response.hasMore
            )
            state.isLoadingMessages = false
            state.isLoadingOlderMessages = false
        } catch {
            state.errorMessage = "Failed to load messages: \(error.localizedDescription)"
            state.isLoadingMessages = false
            state.isLoadingOlderMessages = false
        }
    }

    func loadOlderMessages() async {
        guard let channelId = state.selectedChannelId,
              state.hasMoreMessages,
              !state.isLoadingOlderMessages,
              let oldest = state.messages.first else {
            return
        }

        await loadMessages(channelId: channelId, before: oldest.id)
    }

    func sendMessage(channelId: String, text: String) async {
        let trimmedText = text.trimmingCharacters(in: .whitespaces)
        guard !trimmedText.isEmpty else { return }

        do {
            let message = try await repository.postMessage(
                channelId: channelId,
                text: trimmedText,
                language: localization.locale,
                replyToMessageId: replyingToMessageId
            )
            state.messages.append(message)
            messagesCache[cacheKeyForMessages(channelId: channelId)] = MessageCacheEntry(
                timestamp: Date(),
                locale: localization.locale,
                messages: state.messages,
                hasMore: state.hasMoreMessages
            )
            messageInput = ""
            replyingToMessageId = nil
            statusMessage = nil
            state.errorMessage = nil
        } catch {
            state.errorMessage = "Failed to send message: \(error.localizedDescription)"
        }
    }

    func startReply(messageId: String) {
        replyingToMessageId = messageId
    }

    func cancelReply() {
        replyingToMessageId = nil
    }

    func replyTarget() -> DiscussionMessageDTO? {
        guard let targetId = replyingToMessageId else { return nil }
        return state.messages.first { $0.id == targetId }
    }

    func deleteMessage(messageId: String, channelId: String) async {
        do {
            try await repository.deleteMessage(channelId: channelId, messageId: messageId, language: localization.locale)
            state.messages.removeAll { $0.id == messageId }
            if replyingToMessageId == messageId {
                replyingToMessageId = nil
            }
            messagesCache[cacheKeyForMessages(channelId: channelId)] = MessageCacheEntry(
                timestamp: Date(),
                locale: localization.locale,
                messages: state.messages,
                hasMore: state.hasMoreMessages
            )
            statusMessage = "Message deleted."
        } catch {
            statusMessage = "Unable to delete this message."
        }
    }

    func createChannel() async {
        let title = newChannelTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let description = newChannelDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = newChannelKey.trimmingCharacters(in: .whitespacesAndNewlines)

        guard title.count >= 2, description.count >= 2 else {
            statusMessage = "Title and description must contain at least 2 characters."
            return
        }

        do {
            let channel = try await repository.createChannel(
                language: localization.locale,
                title: title,
                description: description,
                key: key.isEmpty ? nil : key
            )
            state.channels.append(channel)
            channelsCache = nil
            newChannelTitle = ""
            newChannelDescription = ""
            newChannelKey = ""
            statusMessage = "Category created."
        } catch {
            statusMessage = "Unable to create category. Use a unique key/title."
        }
    }

    func deleteChannel(_ channel: DiscussionChannelDTO) async {
        guard canDeleteChannel(channel) else { return }

        do {
            try await repository.deleteChannel(channelId: channel.id, language: localization.locale)
            state.channels.removeAll { $0.id == channel.id }
            channelsCache = nil

            if state.selectedChannelId == channel.id {
                state.selectedChannelId = state.channels.first?.id
                if let selected = state.selectedChannelId {
                    await loadMessages(channelId: selected)
                } else {
                    state.messages = []
                    state.hasMoreMessages = false
                }
            }

            statusMessage = "Category removed."
        } catch {
            statusMessage = "Unable to remove this category (might contain messages or be protected)."
        }
    }

    func canDeleteChannel(_ channel: DiscussionChannelDTO) -> Bool {
        let isDefault = channel.isDefault ?? defaultChannelKeys.contains(channel.key)
        return !isDefault
    }

    func messagePreview(id: String?) -> String? {
        guard let id,
              let message = state.messages.first(where: { $0.id == id }) else {
            return nil
        }

        let body = message.body.trimmingCharacters(in: .whitespacesAndNewlines)
        if body.count <= 70 { return body }
        return String(body.prefix(70)) + "..."
    }

    func selectChannel(_ channelId: String) async {
        state.selectedChannelId = channelId
        replyingToMessageId = nil
        statusMessage = nil
        await loadMessages(channelId: channelId)
    }

    private func cacheKeyForMessages(channelId: String) -> String {
        "\(localization.locale.lowercased())::\(channelId)"
    }
}

struct DiscussionState {
    var isLoading: Bool = false
    var isLoadingMessages: Bool = false
    var isLoadingOlderMessages: Bool = false
    var channels: [DiscussionChannelDTO] = []
    var messages: [DiscussionMessageDTO] = []
    var selectedChannelId: String?
    var hasMoreMessages: Bool = false
    var errorMessage: String?
}
