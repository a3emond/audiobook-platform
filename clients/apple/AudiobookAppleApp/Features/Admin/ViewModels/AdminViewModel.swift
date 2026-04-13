import Foundation
import AudiobookCore

@MainActor
final class AdminViewModel: ObservableObject {
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var overview: AdminOverviewDTO?
    @Published private(set) var jobs: [AdminJobDTO] = []
    @Published private(set) var users: [AdminUserDTO] = []
    @Published var selectedPanel: AdminPanel = .overview

    enum AdminPanel: String, CaseIterable, Identifiable {
        case overview = "Overview"
        case jobs = "Jobs"
        case users = "Users"

        var id: String { rawValue }
    }

    private let repository: AdminRepository

    init(repository: AdminRepository) {
        self.repository = repository
    }

    func load() async {
        isLoading = true
        errorMessage = nil

        do {
            async let overviewTask = repository.overview()
            async let jobsTask = repository.listJobs(status: nil, type: nil, limit: 20, offset: 0)
            async let usersTask = repository.listUsers(role: nil, limit: 20, offset: 0)
            let (overviewResult, jobsResult, usersResult) = try await (overviewTask, jobsTask, usersTask)
            overview = overviewResult
            jobs = jobsResult.jobs
            users = usersResult.users
        } catch {
            errorMessage = "Could not load admin data."
        }

        isLoading = false
    }

    func cancelJob(_ job: AdminJobDTO) async {
        guard !job.id.isEmpty else {
            return
        }

        do {
            let updated = try await repository.cancelJob(jobId: job.id)
            if let idx = jobs.firstIndex(where: { $0.id == updated.id }) {
                jobs[idx] = updated
            }
        } catch {
            errorMessage = "Could not cancel job."
        }
    }

    func promoteUser(_ user: AdminUserDTO) async {
        do {
            let updated = try await repository.updateUserRole(userId: user.id, role: "admin")
            if let idx = users.firstIndex(where: { $0.id == updated.id }) {
                users[idx] = updated
            }
        } catch {
            errorMessage = "Could not update user role."
        }
    }
}
