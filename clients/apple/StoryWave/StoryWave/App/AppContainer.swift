import Foundation
import AudiobookCore
import Combine

@MainActor
final class AppContainer: ObservableObject {
    private var cancellables = Set<AnyCancellable>()

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

    let authViewModel: AuthViewModel
    let libraryViewModel: LibraryViewModel
    let playerViewModel: PlayerViewModel
    let discussionViewModel: DiscussionViewModel
    let profileViewModel: ProfileViewModel
    let profileStatsViewModel: ProfileStatsViewModel
    let profileSettingsViewModel: ProfileSettingsViewModel
    let adminViewModel: AdminViewModel

    init(baseURL: URL) {
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

        // Platform adapters - create before PlayerViewModel since it depends on them
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
            playerActions: nil, // Will be set by PlayerViewModel
            authService: authService,
            repositoryStreamURLProvider: { playerRepository.streamURL(streamPath: $0) }
        )

        self.apiClient = apiClient
        self.authSessionManager = authSessionManager
        self.authService = authService
        self.realtimeClient = realtimeClient
        self.appCacheService = appCacheService
        self.libraryRepository = libraryRepository
        self.playerRepository = playerRepository
        self.discussionRepository = discussionRepository
        self.adminRepository = adminRepository
        self.statsRepository = statsRepository
        self.settingsRepository = settingsRepository
        self.audioSessionAdapter = audioSessionAdapter
        self.remoteCommandsAdapter = remoteCommandsAdapter
        self.keyboardCommandsAdapter = keyboardCommandsAdapter
        self.windowingAdapter = windowingAdapter

        self.authViewModel = AuthViewModel(authService: authService)
        self.libraryViewModel = LibraryViewModel(repository: libraryRepository, apiClient: apiClient, authService: authService, appCacheService: appCacheService)
        self.playerViewModel = PlayerViewModel(
            repository: playerRepository,
            authService: authService,
            realtime: realtimeClient,
            cache: playerCache,
            audioSessionAdapter: audioSessionAdapter,
            remoteCommandsAdapter: remoteCommandsAdapter
        )
        self.discussionViewModel = DiscussionViewModel(repository: discussionRepository, appCacheService: appCacheService)
        self.profileViewModel = ProfileViewModel(authService: authService)
        self.profileStatsViewModel = ProfileStatsViewModel(repository: statsRepository, libraryRepository: libraryRepository, appCacheService: appCacheService)
        self.profileSettingsViewModel = ProfileSettingsViewModel(settingsRepository: settingsRepository, authService: authService)
        self.adminViewModel = AdminViewModel(repository: adminRepository, appCacheService: appCacheService)

        // Set PlayerViewModel as the actions handler for remote commands
        (remoteCommandsAdapter as? RemoteCommandsAdapterImpl)?.playerActions = playerViewModel

        // Wire audio interruption callbacks to player actions
        #if os(iOS)
        (audioSessionAdapter as? IOSAudioSessionAdapter)?.interruptionHandler = playerViewModel
        #else
        (audioSessionAdapter as? MacOSAudioSessionAdapter)?.interruptionHandler = playerViewModel
        #endif

        // Setup platform adapters
        keyboardCommandsAdapter.registerKeyboardCommands()
        windowingAdapter.configureWindow()
        
        // Also set playerActions for keyboard commands on macOS
        #if os(macOS)
        (keyboardCommandsAdapter as? MacMenuCommandsAdapter)?.playerActions = playerViewModel
        #endif

        // Forward auth state changes so any view observing AppContainer re-renders
        self.authViewModel.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)

        // Forward player changes so shell-level mini player visibility reacts
        // to realtime remote presence updates.
        self.playerViewModel.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)

        // Forward profile changes so the admin tab visibility (role check) reacts immediately
        self.profileViewModel.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
    }
}
