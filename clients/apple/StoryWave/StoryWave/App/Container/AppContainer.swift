import Foundation
import AudiobookCore
import Combine

/*
 Purpose:
 Root dependency and view-model container for the Apple client application shell.

 Responsibilities:
 - Wire prebuilt dependencies into shell lifecycle.
 - Wire lifecycle events (auth <-> realtime connection).
 - Route realtime events into feature view models.
*/
@MainActor
final class AppContainer: ObservableObject {
    // MARK: Runtime State

    var cancellables = Set<AnyCancellable>()
    var realtimeSubscriptionIDs: [UUID] = []
    var isRealtimeLifecycleActive = false
    // Temporary verbose logging used while validating realtime progress propagation.
    let progressDebugEnabled = true

    // MARK: Core Services

    let apiClient: APIClient
    let authSessionManager: AuthSessionManager
    let authService: AuthService
    let realtimeClient: RealtimeClient
    let appCacheService: AppCacheService

    let libraryRepository: LibraryRepository
    let playerRepository: PlayerRepository
    let discussionRepository: DiscussionRepository
    let adminRepository: AdminRepository
    let statsRepository: StatsRepository
    let settingsRepository: SettingsRepository

    let audioSessionAdapter: AudioSessionAdapter
    let remoteCommandsAdapter: RemoteCommandsAdapter
    let keyboardCommandsAdapter: KeyboardCommandsAdapter
    let windowingAdapter: WindowingAdapter

    // MARK: Feature View Models

    let authViewModel: AuthViewModel
    let libraryViewModel: LibraryViewModel
    let playerViewModel: PlayerViewModel
    let discussionViewModel: DiscussionViewModel
    let profileViewModel: ProfileViewModel
    let profileStatsViewModel: ProfileStatsViewModel
    let profileSettingsViewModel: ProfileSettingsViewModel
    let adminViewModel: AdminViewModel

    // MARK: Init

    init(baseURL: URL) {
        let dependencies = AppContainerDependencyFactory.build(baseURL: baseURL)

        self.apiClient = dependencies.apiClient
        self.authSessionManager = dependencies.authSessionManager
        self.authService = dependencies.authService
        self.realtimeClient = dependencies.realtimeClient
        self.appCacheService = dependencies.appCacheService
        self.libraryRepository = dependencies.libraryRepository
        self.playerRepository = dependencies.playerRepository
        self.discussionRepository = dependencies.discussionRepository
        self.adminRepository = dependencies.adminRepository
        self.statsRepository = dependencies.statsRepository
        self.settingsRepository = dependencies.settingsRepository
        self.audioSessionAdapter = dependencies.audioSessionAdapter
        self.remoteCommandsAdapter = dependencies.remoteCommandsAdapter
        self.keyboardCommandsAdapter = dependencies.keyboardCommandsAdapter
        self.windowingAdapter = dependencies.windowingAdapter
        self.authViewModel = dependencies.authViewModel
        self.libraryViewModel = dependencies.libraryViewModel
        self.playerViewModel = dependencies.playerViewModel
        self.discussionViewModel = dependencies.discussionViewModel
        self.profileViewModel = dependencies.profileViewModel
        self.profileStatsViewModel = dependencies.profileStatsViewModel
        self.profileSettingsViewModel = dependencies.profileSettingsViewModel
        self.adminViewModel = dependencies.adminViewModel

        configurePostConstructionWiring(using: dependencies)
    }

    // MARK: Lifecycle

    deinit {
        for id in realtimeSubscriptionIDs {
            realtimeClient.unsubscribe(id)
        }
        realtimeClient.disconnect()
    }
}
