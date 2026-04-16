import Foundation
import AudiobookCore
import Combine

@MainActor
final class AppContainer: ObservableObject {
    private var cancellables = Set<AnyCancellable>()
    private var realtimeSubscriptionIDs: [UUID] = []
    private var isRealtimeLifecycleActive = false
    private let progressDebugEnabled = true

    private struct RealtimeDiscussionCreatedPayload: Decodable {
        let message: DiscussionMessageDTO?
    }

    private struct RealtimeDiscussionDeletedPayload: Decodable {
        let messageId: String?
        let lang: String?
        let channelKey: String?
    }

    private struct RealtimeJobStateChangedPayload: Decodable {
        let job: AdminJobDTO?
    }

    private struct RealtimeProgressSyncedPayload: Decodable {
        let bookId: String?
        let positionSeconds: Int?
        let durationAtSave: Int?
        let completed: Bool?
        let timestamp: String?
    }

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
            appCacheService: appCacheService,
            audioSessionAdapter: audioSessionAdapter,
            remoteCommandsAdapter: remoteCommandsAdapter
        )
        self.discussionViewModel = DiscussionViewModel(repository: discussionRepository, appCacheService: appCacheService)
        self.profileViewModel = ProfileViewModel(authService: authService)
        self.profileStatsViewModel = ProfileStatsViewModel(repository: statsRepository, libraryRepository: libraryRepository, appCacheService: appCacheService)
        self.profileSettingsViewModel = ProfileSettingsViewModel(settingsRepository: settingsRepository, authService: authService)
        self.adminViewModel = AdminViewModel(repository: adminRepository, appCacheService: appCacheService)

        // Set PlayerViewModel as the actions handler for remote commands
        remoteCommandsAdapter.playerActions = playerViewModel

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

        configureRealtimeEventRouting()
        setRealtimeLifecycleActive(authViewModel.state.isAuthenticated)
    }

    deinit {
        for id in realtimeSubscriptionIDs {
            realtimeClient.unsubscribe(id)
        }
        realtimeClient.disconnect()
    }

    func setRealtimeLifecycleActive(_ isActive: Bool) {
        guard isRealtimeLifecycleActive != isActive else { return }
        isRealtimeLifecycleActive = isActive

        if isActive {
            realtimeClient.connect()
        } else {
            realtimeClient.disconnect()
        }
    }

    private func configureRealtimeEventRouting() {

        let discussionCreatedID = realtimeClient.subscribe { [weak self] event in
            guard let self, event.type == "discussion.message.created",
                  let payload = event.decodePayload(as: RealtimeDiscussionCreatedPayload.self),
                  let message = payload.message else {
                return
            }

            Task { @MainActor in
                self.discussionViewModel.applyRealtimeMessageCreated(message)
            }
        }

        let discussionDeletedID = realtimeClient.subscribe { [weak self] event in
            guard let self, event.type == "discussion.message.deleted",
                  let payload = event.decodePayload(as: RealtimeDiscussionDeletedPayload.self),
                  let messageId = payload.messageId,
                  let lang = payload.lang,
                  let channelKey = payload.channelKey else {
                return
            }

            Task { @MainActor in
                self.discussionViewModel.applyRealtimeMessageDeleted(
                    messageId: messageId,
                    lang: lang,
                    channelKey: channelKey
                )
            }
        }

        let adminJobsID = realtimeClient.subscribe { [weak self] event in
            guard let self, event.type == "job.state.changed",
                  let payload = event.decodePayload(as: RealtimeJobStateChangedPayload.self),
                  let job = payload.job else {
                return
            }

            Task { @MainActor in
                self.adminViewModel.applyRealtimeJobUpdate(job)
            }
        }

        let catalogAddedID = realtimeClient.subscribe { [weak self] event in
            guard let self, event.type == "catalog.book.added" else {
                return
            }

            Task { @MainActor in
                self.appCacheService.invalidateLibrary()
            }
        }

        let progressSyncedID = realtimeClient.subscribe { [weak self] event in
            guard let self, event.type == "progress.synced",
                  let payload = event.decodePayload(as: RealtimeProgressSyncedPayload.self),
                  let bookId = payload.bookId else {
                return
            }

            if self.progressDebugEnabled {
                print(
                    "[ProgressDebug][Realtime] progress.synced bookId=\(bookId) " +
                    "position=\(payload.positionSeconds.map(String.init) ?? "nil") " +
                    "duration=\(payload.durationAtSave.map(String.init) ?? "nil") " +
                    "completed=\(payload.completed.map { String($0) } ?? "nil") " +
                    "timestamp=\(payload.timestamp ?? "nil")"
                )
            }

            Task { @MainActor in
                await self.libraryViewModel.applyRealtimeProgressSync(
                    bookId: bookId,
                    positionSeconds: payload.positionSeconds,
                    durationAtSave: payload.durationAtSave,
                    completed: payload.completed,
                    timestamp: payload.timestamp
                )
                if self.progressDebugEnabled {
                    self.libraryViewModel.debugProgressSnapshot(for: bookId, source: "realtime.progress.synced")
                }
            }
        }

        realtimeSubscriptionIDs = [
            discussionCreatedID,
            discussionDeletedID,
            adminJobsID,
            catalogAddedID,
            progressSyncedID,
        ]
    }
}
