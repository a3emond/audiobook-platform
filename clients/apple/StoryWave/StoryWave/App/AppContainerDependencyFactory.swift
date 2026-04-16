import Foundation
import AudiobookCore

/*
 Purpose:
 Construct the AppContainer dependency graph (services, repositories, adapters, and feature view models).

 Why separate file:
 Keeps AppContainer focused on lifecycle/orchestration while this factory owns object graph assembly.
*/
@MainActor
struct AppContainerDependencies {
    // MARK: Core Services

    let apiClient: APIClient
    let authSessionManager: AuthSessionManager
    let authService: AuthService
    let realtimeClient: RealtimeClient
    let appCacheService: AppCacheService

    // MARK: Repositories

    let libraryRepository: LibraryRepository
    let playerRepository: PlayerRepository
    let discussionRepository: DiscussionRepository
    let adminRepository: AdminRepository
    let statsRepository: StatsRepository
    let settingsRepository: SettingsRepository

    // MARK: Platform Adapters

    let audioSessionAdapter: AudioSessionAdapter
    let remoteCommandsAdapter: RemoteCommandsAdapterImpl
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
}

enum AppContainerDependencyFactory {
    // MARK: Build

    @MainActor
    static func build(baseURL: URL) -> AppContainerDependencies {
        let apiClient = APIClient(baseURL: baseURL)
        let authSessionManager = AuthSessionManager()
        let authService = AuthService(apiClient: apiClient, sessionManager: authSessionManager)
        let realtimeClient = RealtimeClient(baseURL: baseURL)
        let appCacheService = AppCacheService()

        let libraryRepository = LibraryRepositoryImpl(authService: authService)
        let playerRepository = PlayerRepositoryImpl(authService: authService, apiClient: apiClient)
        let discussionRepository = DiscussionRepositoryImpl(authService: authService)
        let adminRepository = AdminRepositoryImpl(authService: authService, apiClient: apiClient)
        let statsRepository = StatsRepositoryImpl(authService: authService)
        let settingsRepository = SettingsRepositoryImpl(authService: authService)
        let playerCache = PlayerPlaybackCache()

        // Platform adapters - create before PlayerViewModel since it depends on them.
        #if os(iOS)
        let audioSessionAdapter: AudioSessionAdapter = IOSAudioSessionAdapter()
        let keyboardCommandsAdapter: KeyboardCommandsAdapter = IOSKeyboardCommandsAdapter()
        let windowingAdapter: WindowingAdapter = IOSWindowingAdapter()
        #else
        let audioSessionAdapter: AudioSessionAdapter = MacOSAudioSessionAdapter()
        let keyboardCommandsAdapter: KeyboardCommandsAdapter = MacMenuCommandsAdapter()
        let windowingAdapter: WindowingAdapter = MacOSWindowingAdapter()
        #endif

        let remoteCommandsAdapter = RemoteCommandsAdapterImpl(
            playerActions: nil, // wired after PlayerViewModel exists
            authService: authService,
            repositoryStreamURLProvider: { playerRepository.streamURL(streamPath: $0) }
        )

        let authViewModel = AuthViewModel(authService: authService)
        let libraryViewModel = LibraryViewModel(
            repository: libraryRepository,
            apiClient: apiClient,
            authService: authService,
            appCacheService: appCacheService
        )
        let playerViewModel = PlayerViewModel(
            repository: playerRepository,
            authService: authService,
            realtime: realtimeClient,
            cache: playerCache,
            appCacheService: appCacheService,
            audioSessionAdapter: audioSessionAdapter,
            remoteCommandsAdapter: remoteCommandsAdapter
        )
        let discussionViewModel = DiscussionViewModel(repository: discussionRepository, appCacheService: appCacheService)
        let profileViewModel = ProfileViewModel(authService: authService)
        let profileStatsViewModel = ProfileStatsViewModel(
            repository: statsRepository,
            libraryRepository: libraryRepository,
            appCacheService: appCacheService
        )
        let profileSettingsViewModel = ProfileSettingsViewModel(settingsRepository: settingsRepository, authService: authService)
        let adminViewModel = AdminViewModel(repository: adminRepository, appCacheService: appCacheService)

        return AppContainerDependencies(
            apiClient: apiClient,
            authSessionManager: authSessionManager,
            authService: authService,
            realtimeClient: realtimeClient,
            appCacheService: appCacheService,
            libraryRepository: libraryRepository,
            playerRepository: playerRepository,
            discussionRepository: discussionRepository,
            adminRepository: adminRepository,
            statsRepository: statsRepository,
            settingsRepository: settingsRepository,
            audioSessionAdapter: audioSessionAdapter,
            remoteCommandsAdapter: remoteCommandsAdapter,
            keyboardCommandsAdapter: keyboardCommandsAdapter,
            windowingAdapter: windowingAdapter,
            authViewModel: authViewModel,
            libraryViewModel: libraryViewModel,
            playerViewModel: playerViewModel,
            discussionViewModel: discussionViewModel,
            profileViewModel: profileViewModel,
            profileStatsViewModel: profileStatsViewModel,
            profileSettingsViewModel: profileSettingsViewModel,
            adminViewModel: adminViewModel
        )
    }
}
