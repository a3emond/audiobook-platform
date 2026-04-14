import SwiftUI
import AudiobookCore
import Combine

@MainActor
final class DiscussionViewModel: ObservableObject {
    @Published private(set) var state = DiscussionState()
    @Published var messageInput: String = ""
    @Published private(set) var eventMessage: String?

    private let repository: DiscussionRepository
    private let appCacheService: AppCacheService
    private let localization = LocalizationService.shared
    private var cancellables = Set<AnyCancellable>()
    private var channelsCache: (timestamp: Date, locale: String, channels: [DiscussionChannelDTO])?
    private var messagesCache: [String: (timestamp: Date, locale: String, messages: [DiscussionMessageDTO])] = [:]
    private let cacheTTL: TimeInterval = 60

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

    func loadMessages(channelId: String) async {
        let cacheKey = cacheKeyForMessages(channelId: channelId)
        if let cached = messagesCache[cacheKey],
           cached.locale == localization.locale,
           Date().timeIntervalSince(cached.timestamp) <= cacheTTL {
            state.messages = cached.messages
            return
        }

        state.isLoadingMessages = true
        state.errorMessage = nil

        do {
            let messages = try await repository.listMessages(channelId: channelId, language: localization.locale, limit: 100, offset: 0)
            state.messages = messages
            messagesCache[cacheKey] = (Date(), localization.locale, messages)
            state.isLoadingMessages = false
        } catch {
            state.errorMessage = "Failed to load messages: \(error.localizedDescription)"
            state.isLoadingMessages = false
        }
    }

    func sendMessage(channelId: String, text: String) async {
        let trimmedText = text.trimmingCharacters(in: .whitespaces)
        guard !trimmedText.isEmpty else { return }

        do {
            let message = try await repository.postMessage(channelId: channelId, text: trimmedText, language: localization.locale)
            state.messages.append(message)
            messagesCache[cacheKeyForMessages(channelId: channelId)] = (Date(), localization.locale, state.messages)
            messageInput = ""
            state.errorMessage = nil
        } catch {
            state.errorMessage = "Failed to send message: \(error.localizedDescription)"
        }
    }

    func selectChannel(_ channelId: String) async {
        state.selectedChannelId = channelId
        await loadMessages(channelId: channelId)
    }

    private func cacheKeyForMessages(channelId: String) -> String {
        "\(localization.locale.lowercased())::\(channelId)"
    }
}

struct DiscussionState {
    var isLoading: Bool = false
    var isLoadingMessages: Bool = false
    var channels: [DiscussionChannelDTO] = []
    var messages: [DiscussionMessageDTO] = []
    var selectedChannelId: String?
    var errorMessage: String?
}
