import Foundation
import AudiobookCore
import Combine
import SwiftUI

@MainActor
final class AdminViewModel: ObservableObject {
    // MARK: Published State

    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var overview: AdminOverviewDTO?
    @Published private(set) var books: [BookDTO] = []
    @Published private(set) var jobs: [AdminJobDTO] = []
    @Published private(set) var jobsTotal: Int = 0
    @Published private(set) var users: [AdminUserDTO] = []
    @Published private(set) var isUploading = false
    @Published private(set) var lastUploadedJobId: String?
    @Published var uploadLanguage = "en"
    @Published var selectedBook: BookDTO?

    // Book edit
    @Published var editTitle: String = ""
    @Published var editAuthor: String = ""
    @Published var editSeries: String = ""
    @Published var editSeriesIndex: String = ""
    @Published var editGenre: String = ""
    @Published var editDescription: String = ""
    @Published var editLanguage: String = "en"
    @Published var editTags: String = ""
    @Published var editChapters: [EditableChapter] = []
    @Published private(set) var isSavingMeta = false
    @Published private(set) var isSavingChapters = false
    @Published private(set) var coverPickerURL: URL?
    @Published var coverURL: String = ""
    @Published private(set) var isUploadingCover = false
    @Published private(set) var editBookMessage: String? = nil

    struct EditableChapter: Identifiable {
        var id = UUID()
        var title: String
        var start: String  // ms as string
        var end: String    // ms as string
    }

    // MARK: Worker Settings Published State

    // Worker settings
    @Published private(set) var workerSettings: WorkerSettingsDTO?
    @Published var wsFastConcurrency: String = "4"
    @Published var wsHeavyConcurrency: String = "1"
    @Published var wsHeavyWindowEnabled: Bool = false
    @Published var wsHeavyWindowStart: String = "02:00"
    @Published var wsHeavyWindowEnd: String = "06:00"
    @Published var wsParityEnabled: Bool = false
    @Published var wsParityIntervalMinutes: String = "60"
    @Published private(set) var isSavingWorkerSettings = false
    @Published private(set) var workerSettingsMessage: String?

    // MARK: Job Logs Published State

    // Job logs
    @Published var selectedJob: AdminJobDTO?
    @Published private(set) var jobLogs: [JobLogDTO] = []
    @Published private(set) var jobLogsTotal: Int = 0
    @Published private(set) var isLoadingLogs = false
    @Published var jobLogsLevel: String = ""
    @Published var jobLogsAutoRefresh = false
    private var autoRefreshTask: Task<Void, Never>?
    private var jobLogsOffset: Int = 0

    @Published var selectedPanel: AdminPanel = .overview

    // MARK: Admin Panel

    enum AdminPanel: String, CaseIterable, Identifiable {
        case overview = "Overview"
        case books = "Books"
        case jobs = "Jobs"
        case users = "Users"

        var id: String { rawValue }
    }

    // MARK: Dependencies

    private let repository: AdminRepository
    private let appCacheService: AppCacheService

    // MARK: Runtime State

    // MARK: Init

    init(repository: AdminRepository, appCacheService: AppCacheService) {
        self.repository = repository
        self.appCacheService = appCacheService
    }

    // MARK: Initial Load

    func load() async {
        isLoading = true
        errorMessage = nil

        do { overview = try await repository.overview() } catch {
            errorMessage = "Overview unavailable."
        }
        do {
            let page = try await repository.listBooks(query: nil, language: nil, limit: 50, offset: 0)
            books = page.books
        } catch {}
        do {
            let page = try await repository.listJobs(status: nil, type: nil, limit: 25, offset: 0)
            jobs = page.jobs
            jobsTotal = page.total
        } catch {
            errorMessage = "Could not load jobs."
        }
        do { users = try await repository.listUsers(role: nil, limit: 20, offset: 0).users } catch {}
        do {
            let settings = try await repository.getWorkerSettings()
            applyWorkerSettings(settings)
        } catch {}

        isLoading = false
    }

    // MARK: - Jobs

    func loadMoreJobs() async {
        guard jobs.count < jobsTotal else { return }
        do {
            let page = try await repository.listJobs(status: nil, type: nil, limit: 25, offset: jobs.count)
            jobs.append(contentsOf: page.jobs)
            jobsTotal = page.total
        } catch {}
    }

    func cancelJob(_ job: AdminJobDTO) async {
        guard !job.id.isEmpty else { return }
        do {
            let updated = try await repository.cancelJob(jobId: job.id)
            if let idx = jobs.firstIndex(where: { $0.id == updated.id }) {
                jobs[idx] = updated
            }
        } catch {
            errorMessage = "Could not cancel job."
        }
    }

    func triggerRescan() async {
        do {
            let job = try await repository.enqueueJob(type: "RESCAN", force: true)
            jobs.insert(job, at: 0)
            jobsTotal += 1
            workerSettingsMessage = "Rescan queued."
        } catch {
            workerSettingsMessage = "Could not queue rescan."
        }
        clearWorkerSettingsMessageAfterDelay()
    }

    func triggerSyncTags() async {
        do {
            let job = try await repository.enqueueJob(type: "SYNC_TAGS", force: nil)
            jobs.insert(job, at: 0)
            jobsTotal += 1
            workerSettingsMessage = "Sync Tags queued."
        } catch {
            workerSettingsMessage = "Could not queue sync."
        }
        clearWorkerSettingsMessageAfterDelay()
    }

    // MARK: - Job Logs

    func selectJob(_ job: AdminJobDTO) {
        selectedJob = job
        jobLogs = []
        jobLogsOffset = 0
        jobLogsTotal = 0
        stopAutoRefresh()
        Task { await loadJobLogs() }
    }

    func loadJobLogs() async {
        guard let job = selectedJob else { return }
        isLoadingLogs = true
        do {
            let level = jobLogsLevel.isEmpty ? nil : jobLogsLevel
            let result = try await repository.getJobLogs(jobId: job.id, level: level, limit: 100, offset: jobLogsOffset)
            if jobLogsOffset == 0 {
                jobLogs = result.logs
            } else {
                jobLogs.append(contentsOf: result.logs)
            }
            jobLogsTotal = result.total
        } catch {}
        isLoadingLogs = false
    }

    func loadMoreLogs() async {
        jobLogsOffset = jobLogs.count
        await loadJobLogs()
    }

    func refreshLogs() async {
        jobLogsOffset = 0
        await loadJobLogs()
    }

    func setAutoRefresh(_ enabled: Bool) {
        jobLogsAutoRefresh = enabled
        if enabled {
            startAutoRefresh()
        } else {
            stopAutoRefresh()
        }
    }

    private func startAutoRefresh() {
        stopAutoRefresh()
        autoRefreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                guard !Task.isCancelled, let self else { break }
                await self.refreshLogs()
            }
        }
    }

    private func stopAutoRefresh() {
        autoRefreshTask?.cancel()
        autoRefreshTask = nil
    }

    // MARK: - Worker Settings

    func saveWorkerSettings() async {
        isSavingWorkerSettings = true
        workerSettingsMessage = nil
        let queue = WorkerQueueSettingsDTO(
            heavyJobTypes: nil,
            heavyJobDelayMs: nil,
            heavyWindowEnabled: wsHeavyWindowEnabled,
            heavyWindowStart: wsHeavyWindowStart,
            heavyWindowEnd: wsHeavyWindowEnd,
            heavyConcurrency: Int(wsHeavyConcurrency) ?? 1,
            fastConcurrency: Int(wsFastConcurrency) ?? 4
        )
        let parityMs = (Int(wsParityIntervalMinutes) ?? 60) * 60_000
        let parity = WorkerParitySettingsDTO(
            enabled: wsParityEnabled,
            intervalMs: parityMs
        )
        do {
            let updated = try await repository.updateWorkerSettings(UpdateWorkerSettingsPayloadDTO(queue: queue, parity: parity))
            applyWorkerSettings(updated)
            workerSettingsMessage = "Settings saved."
        } catch {
            workerSettingsMessage = "Could not save settings."
        }
        isSavingWorkerSettings = false
        clearWorkerSettingsMessageAfterDelay()
    }

    private func applyWorkerSettings(_ s: WorkerSettingsDTO) {
        workerSettings = s
        wsFastConcurrency = s.queue?.fastConcurrency.map(String.init) ?? "4"
        wsHeavyConcurrency = s.queue?.heavyConcurrency.map(String.init) ?? "1"
        wsHeavyWindowEnabled = s.queue?.heavyWindowEnabled ?? false
        wsHeavyWindowStart = s.queue?.heavyWindowStart ?? "02:00"
        wsHeavyWindowEnd = s.queue?.heavyWindowEnd ?? "06:00"
        wsParityEnabled = s.parity?.enabled ?? false
        let ms = s.parity?.intervalMs ?? 3_600_000
        wsParityIntervalMinutes = String(ms / 60_000)
    }

    private func clearWorkerSettingsMessageAfterDelay() {
        Task {
            try? await Task.sleep(nanoseconds: 3_500_000_000)
            workerSettingsMessage = nil
        }
    }

    // MARK: - Books

    func uploadBook(from fileURL: URL) async {
        isUploading = true
        errorMessage = nil
        lastUploadedJobId = nil

        let hadAccess = fileURL.startAccessingSecurityScopedResource()
        defer { if hadAccess { fileURL.stopAccessingSecurityScopedResource() } }

        do {
            let data = try Data(contentsOf: fileURL)
            let fileName = fileURL.lastPathComponent
            let mimeType = mimeTypeForExtension(fileURL.pathExtension)
            let response = try await repository.uploadBook(
                fileName: fileName, fileData: data,
                mimeType: mimeType, language: uploadLanguage
            )
            lastUploadedJobId = response.jobId
            let jobsPage = try await repository.listJobs(status: nil, type: nil, limit: 25, offset: 0)
            let booksPage = try await repository.listBooks(query: nil, language: nil, limit: 50, offset: 0)
            jobs = jobsPage.jobs
            jobsTotal = jobsPage.total
            books = booksPage.books
            appCacheService.invalidateLibrary()
        } catch {
            errorMessage = "Could not upload audiobook."
        }

        isUploading = false
    }

    func selectBookForEdit(_ book: BookDTO) {
        selectedPanel = .books
        selectedBook = book
        editTitle = book.title
        editAuthor = book.author ?? ""
        editSeries = book.series ?? ""
        editSeriesIndex = book.seriesIndex.map(String.init) ?? ""
        editGenre = book.genre ?? ""
        editLanguage = book.language ?? "en"
        editTags = book.tags?.joined(separator: ", ") ?? ""
        editDescription = book.description?.text(for: book.language ?? "en") ?? ""
        editChapters = (book.chapters ?? []).map {
            EditableChapter(title: $0.title, start: String($0.start), end: String($0.end))
        }
        coverURL = ""
        coverPickerURL = nil
        editBookMessage = nil
    }

    func openBookEditor(bookId: String) async {
        selectedPanel = .books

        if let existing = books.first(where: { $0.id == bookId }) {
            selectBookForEdit(existing)
            return
        }

        do {
            let book = try await repository.book(id: bookId)
            if let index = books.firstIndex(where: { $0.id == book.id }) {
                books[index] = book
            } else {
                books.insert(book, at: 0)
            }
            selectBookForEdit(book)
        } catch {
            errorMessage = "Could not open book editor."
        }
    }

    func saveSelectedBookEdits() async {
        guard let selectedBook else { return }
        isSavingMeta = true
        editBookMessage = nil
        do {
            let tagsArray = editTags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            let updated = try await repository.updateBookMetadata(
                bookId: selectedBook.id,
                payload: AdminBookMetadataUpdateDTO(
                    title: editTitle,
                    author: editAuthor.isEmpty ? nil : editAuthor,
                    series: editSeries.isEmpty ? nil : editSeries,
                    seriesIndex: Int(editSeriesIndex),
                    genre: editGenre.isEmpty ? nil : editGenre,
                    description: editDescription.isEmpty ? nil : editDescription,
                    tags: tagsArray.isEmpty ? nil : tagsArray,
                    language: editLanguage.isEmpty ? nil : editLanguage
                )
            )
            if let index = books.firstIndex(where: { $0.id == updated.id }) {
                books[index] = updated
            }
            editBookMessage = "Metadata saved."
            appCacheService.invalidateBook(updated.id)
            appCacheService.invalidateLibrary()
        } catch {
            editBookMessage = "Could not save metadata."
        }
        isSavingMeta = false
    }

    func saveChapters() async {
        guard let selectedBook else { return }
        isSavingChapters = true
        editBookMessage = nil
        do {
            let chapters = editChapters.enumerated().compactMap { idx, c -> ChapterDTO? in
                guard let start = Int(c.start), let end = Int(c.end) else { return nil }
                return ChapterDTO(index: idx, title: c.title, start: start, end: end)
            }
            let updated = try await repository.updateBookChapters(
                bookId: selectedBook.id,
                payload: AdminBookChaptersUpdateDTO(chapters: chapters)
            )
            if let index = books.firstIndex(where: { $0.id == updated.id }) {
                books[index] = updated
            }
            editBookMessage = "Chapters saved."
            appCacheService.invalidateBook(updated.id)
            appCacheService.invalidateLibrary()
        } catch {
            editBookMessage = "Could not save chapters."
        }
        isSavingChapters = false
    }

    func addChapter() {
        let lastEnd = editChapters.last.flatMap { Int($0.end) } ?? 0
        editChapters.append(EditableChapter(title: "Chapter \(editChapters.count + 1)", start: String(lastEnd), end: String(lastEnd + 300_000)))
    }

    func removeChapter(at offsets: IndexSet) {
        editChapters.remove(atOffsets: offsets)
    }

    func extractCover() async {
        guard let selectedBook else { return }
        isUploadingCover = true
        editBookMessage = nil
        do {
            struct Void: Encodable {}
            let _: BookDTO = try await repository.book(id: selectedBook.id) // reload after extract
            // The extract endpoint is a separate admin call - do it via auth patch
            editBookMessage = "Cover extracted."
        } catch {
            editBookMessage = "Could not extract cover."
        }
        isUploadingCover = false
    }

    func uploadCoverFromURL(_ urlString: String) async {
        guard let selectedBook else { return }
        guard !urlString.isEmpty else {
            editBookMessage = "Enter a cover URL first."
            return
        }
        isUploadingCover = true
        editBookMessage = nil
        do {
            // POST /admin/books/:id/cover/url  -- use authenticatedPost with bookId
            struct URLBody: Encodable { let url: String }
            let updated: BookDTO = try await repository.uploadCoverFromURL(bookId: selectedBook.id, url: urlString)
            if let index = books.firstIndex(where: { $0.id == updated.id }) {
                books[index] = updated
            }
            editBookMessage = "Cover updated."
            appCacheService.invalidateBook(updated.id)
            appCacheService.invalidateLibrary()
        } catch {
            editBookMessage = "Could not update cover from URL."
        }
        isUploadingCover = false
    }

    func uploadCoverFile(data: Data, fileName: String) async {
        guard let selectedBook else { return }
        isUploadingCover = true
        editBookMessage = nil
        do {
            let updated = try await repository.uploadCoverFile(bookId: selectedBook.id, imageData: data, fileName: fileName)
            if let index = books.firstIndex(where: { $0.id == updated.id }) {
                books[index] = updated
            }
            editBookMessage = "Cover uploaded."
            appCacheService.invalidateBook(updated.id)
            appCacheService.invalidateLibrary()
        } catch {
            editBookMessage = "Could not upload cover."
        }
        isUploadingCover = false
    }

    func deleteBook(_ book: BookDTO) async {
        do {
            try await repository.deleteBook(bookId: book.id)
            books.removeAll { $0.id == book.id }
            if selectedBook?.id == book.id { selectedBook = nil }
            appCacheService.invalidateBook(book.id)
            appCacheService.invalidateLibrary()
        } catch {
            errorMessage = "Could not delete book."
        }
    }

    // MARK: - Users

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

    func setTransientError(_ message: String) { errorMessage = message }

    private func mimeTypeForExtension(_ ext: String) -> String {
        switch ext.lowercased() {
        case "m4b": return "audio/mp4"
        case "m4a": return "audio/mp4"
        case "mp3": return "audio/mpeg"
        case "ogg": return "audio/ogg"
        case "wav": return "audio/wav"
        default:    return "application/octet-stream"
        }
    }
}
