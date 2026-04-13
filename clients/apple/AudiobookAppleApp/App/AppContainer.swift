import Foundation
import AudiobookCore

@MainActor
final class AppContainer: ObservableObject {
    let apiClient: APIClient
    let authSessionManager: AuthSessionManager
    let authService: AuthService
    let realtimeClient: RealtimeClient

    let libraryRepository: LibraryRepository
    let playerRepository: PlayerRepository
    let discussionRepository: DiscussionRepository
    let adminRepository: AdminRepository

    let authViewModel: AuthViewModel
    let libraryViewModel: LibraryViewModel
    let playerViewModel: PlayerViewModel
    let discussionViewModel: DiscussionViewModel
    let profileViewModel: ProfileViewModel
    let adminViewModel: AdminViewModel

    init(baseURL: URL) {
        let apiClient = APIClient(baseURL: baseURL)
        let authSessionManager = AuthSessionManager()
        let authService = AuthService(apiClient: apiClient, sessionManager: authSessionManager)
        let realtimeClient = RealtimeClient(baseURL: baseURL)

        let libraryRepository = LibraryRepositoryImpl(authService: authService)
        let playerRepository = PlayerRepositoryImpl(authService: authService, apiClient: apiClient)
        let discussionRepository = DiscussionRepositoryImpl(authService: authService)
        let adminRepository = AdminRepositoryImpl(authService: authService)

        self.apiClient = apiClient
        self.authSessionManager = authSessionManager
        self.authService = authService
        self.realtimeClient = realtimeClient
        self.libraryRepository = libraryRepository
        self.playerRepository = playerRepository
        self.discussionRepository = discussionRepository
        self.adminRepository = adminRepository

        self.authViewModel = AuthViewModel(authService: authService)
        self.libraryViewModel = LibraryViewModel(repository: libraryRepository)
        self.playerViewModel = PlayerViewModel(repository: playerRepository, authService: authService, realtime: realtimeClient)
        self.discussionViewModel = DiscussionViewModel(repository: discussionRepository)
        self.profileViewModel = ProfileViewModel(authService: authService)
        self.adminViewModel = AdminViewModel(repository: adminRepository)
    }
}
