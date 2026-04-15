import SwiftUI
import AudiobookCore
import UniformTypeIdentifiers
import PhotosUI

// MARK: - AdminView

struct AdminView: View {
    @ObservedObject var viewModel: AdminViewModel
    @State private var isUploadPickerPresented = false
    @State private var isCoverPickerPresented = false
    @State private var pendingDeleteBook: BookDTO?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Panel", selection: $viewModel.selectedPanel) {
                    ForEach(AdminViewModel.AdminPanel.allCases) { panel in
                        Text(panel.rawValue).tag(panel)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 8)

                if viewModel.isLoading {
                    ProgressView("Loading admin data...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    if let error = viewModel.errorMessage {
                        Text(error)
                            .foregroundStyle(.red)
                            .font(.footnote)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 20)
                            .padding(.bottom, 4)
                    }
                    panelView
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle("Admin")
            .task {
                if viewModel.overview == nil && !viewModel.isLoading {
                    await viewModel.load()
                }
            }
        }
    }

    @ViewBuilder
    private var panelView: some View {
        switch viewModel.selectedPanel {
        case .overview: overviewPanel
        case .books:    booksPanel
        case .jobs:     jobsPanel
        case .users:    usersPanel
        }
    }

    // MARK: - Overview

    private var overviewPanel: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let o = viewModel.overview {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        AdminStatCardView(label: "Users", value: o.counts.users, icon: "person.2")
                        AdminStatCardView(label: "Books", value: o.counts.books, icon: "books.vertical")
                        AdminStatCardView(label: "Collections", value: o.counts.collections, icon: "folder")
                        AdminStatCardView(label: "Jobs", value: o.counts.jobs, icon: "gearshape.2")
                    }
                    if !o.jobsByStatus.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Jobs by Status")
                                .font(.headline)
                            ForEach(o.jobsByStatus.sorted(by: { $0.key < $1.key }), id: \.key) { key, val in
                                HStack {
                                    Text(key).foregroundStyle(.secondary)
                                    Spacer()
                                    Text("\(val)").bold()
                                }
                                .font(.subheadline)
                            }
                        }
                        .padding(14)
                        .background(Branding.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                } else {
                    ContentUnavailableView("No overview data", systemImage: "chart.bar")
                }
            }
            .padding(20)
        }
    }

    // MARK: - Jobs

    private var jobsPanel: some View {
        #if os(macOS)
        HSplitView {
            jobsListColumn
                .frame(minWidth: 280, idealWidth: 340)
                .frame(maxHeight: .infinity, alignment: .top)

            jobLogsColumn
                .frame(minWidth: 320)
                .frame(maxHeight: .infinity, alignment: .top)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        #else
        VStack(spacing: 0) {
            jobsListColumn
            if viewModel.selectedJob != nil {
                Divider().padding(.vertical, 8)
                jobLogsColumn
            }
        }
        #endif
    }

    private var jobsListColumn: some View {
        VStack(spacing: 0) {
            // Worker settings
            workerSettingsCard
                .padding([.horizontal, .top], 12)

            if let msg = viewModel.workerSettingsMessage {
                Text(msg)
                    .font(.caption)
                    .foregroundStyle(msg.contains("Could") ? .red : .green)
                    .padding(.horizontal, 12)
            }

            Divider().padding(.top, 10)

            // Jobs list header
            HStack {
                Text("Jobs (\(viewModel.jobsTotal))")
                    .font(.headline)
                Spacer()
                Button { Task { await viewModel.load() } } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.borderless)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            if viewModel.jobs.isEmpty {
                ContentUnavailableView("No jobs", systemImage: "tray",
                    description: Text("Uploads and worker tasks will appear here."))
            } else {
                List(selection: Binding(
                    get: { viewModel.selectedJob?.id },
                    set: { id in
                        if let id, let job = viewModel.jobs.first(where: { $0.id == id }) {
                            viewModel.selectJob(job)
                        } else {
                            viewModel.deselectJob()
                        }
                    }
                )) {
                    ForEach(viewModel.jobs) { job in
                        jobRow(job)
                            .tag(job.id)
                    }
                    if viewModel.jobs.count < viewModel.jobsTotal {
                        Button("Load more (\(viewModel.jobs.count) / \(viewModel.jobsTotal))") {
                            Task { await viewModel.loadMoreJobs() }
                        }
                        .buttonStyle(.borderless)
                        .foregroundStyle(Branding.accent)
                    }
                }
                .listStyle(.plain)
                .frame(maxHeight: .infinity)
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }

    private func jobRow(_ job: AdminJobDTO) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(job.type ?? "job")
                    .font(.subheadline.weight(.semibold))
                HStack(spacing: 6) {
                    AdminJobStatusBadgeView(status: job.status)
                    if let attempt = job.attempt, let max = job.maxAttempts, max > 1 {
                        Text("attempt \(attempt)/\(max)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                if let ts = job.createdAt {
                    Text(shortDate(ts))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer()
            if ["queued", "running", "retrying"].contains(job.status) {
                Button("Cancel") { Task { await viewModel.cancelJob(job) } }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
        }
        .padding(.vertical, 4)
    }

    private var workerSettingsCard: some View {
        DisclosureGroup("Worker Settings") {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    LabeledContent("Fast workers") {
                        TextField("4", text: $viewModel.wsFastConcurrency)
                            .frame(width: 44)
                            .textFieldStyle(.roundedBorder)
                    }
                    LabeledContent("Heavy workers") {
                        TextField("1", text: $viewModel.wsHeavyConcurrency)
                            .frame(width: 44)
                            .textFieldStyle(.roundedBorder)
                    }
                }
                Toggle("Heavy window", isOn: $viewModel.wsHeavyWindowEnabled)
                if viewModel.wsHeavyWindowEnabled {
                    HStack(spacing: 8) {
                        TextField("From", text: $viewModel.wsHeavyWindowStart)
                            .frame(width: 60)
                            .textFieldStyle(.roundedBorder)
                        Text("–")
                        TextField("To", text: $viewModel.wsHeavyWindowEnd)
                            .frame(width: 60)
                            .textFieldStyle(.roundedBorder)
                    }
                }
                Divider()
                Toggle("Parity scan", isOn: $viewModel.wsParityEnabled)
                if viewModel.wsParityEnabled {
                    LabeledContent("Interval (min)") {
                        TextField("60", text: $viewModel.wsParityIntervalMinutes)
                            .frame(width: 60)
                            .textFieldStyle(.roundedBorder)
                    }
                }
                Divider()
                HStack(spacing: 8) {
                    Button("Save") { Task { await viewModel.saveWorkerSettings() } }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .disabled(viewModel.isSavingWorkerSettings)
                    Button("Rescan") { Task { await viewModel.triggerRescan() } }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    Button("Sync Tags") { Task { await viewModel.triggerSyncTags() } }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
            }
            .padding(.top, 6)
        }
        .padding(12)
        .background(Branding.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Job Logs

    private var jobLogsColumn: some View {
        VStack(spacing: 0) {
            HStack {
                if let job = viewModel.selectedJob {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(job.type ?? "Job")
                            .font(.headline)
                        AdminJobStatusBadgeView(status: job.status)
                    }
                } else {
                    Text("Job logs")
                        .font(.headline)
                }
                Spacer()
                Picker("Level", selection: $viewModel.jobLogsLevel) {
                    Text("All").tag("")
                    Text("Debug").tag("debug")
                    Text("Info").tag("info")
                    Text("Warn").tag("warn")
                    Text("Error").tag("error")
                }
                .frame(width: 110)
                .onChange(of: viewModel.jobLogsLevel) { _, _ in
                    Task { await viewModel.refreshLogs() }
                }
                .disabled(viewModel.selectedJob == nil)

                Button { Task { await viewModel.refreshLogs() } } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.borderless)
                .disabled(viewModel.selectedJob == nil)

                Toggle("Auto", isOn: Binding(
                    get: { viewModel.jobLogsAutoRefresh },
                    set: { value in
                        DispatchQueue.main.async {
                            viewModel.setAutoRefresh(value)
                        }
                    }
                ))
                .toggleStyle(.button)
                .controlSize(.small)
                .disabled(viewModel.selectedJob == nil)

                if viewModel.selectedJob != nil {
                    Button("Close") {
                        viewModel.deselectJob()
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            Divider()

            if viewModel.selectedJob == nil {
                ContentUnavailableView("No job selected", systemImage: "doc.text",
                    description: Text("Select a job to view runtime logs."))
            } else if viewModel.isLoadingLogs && viewModel.jobLogs.isEmpty {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let logsError = viewModel.jobLogsErrorMessage {
                VStack(spacing: 10) {
                    Text(logsError)
                        .font(.footnote)
                        .foregroundStyle(.red)
                    Button("Retry") {
                        Task { await viewModel.refreshLogs() }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.jobLogs.isEmpty {
                ContentUnavailableView("No logs", systemImage: "doc.text",
                    description: Text("No log entries found for this job."))
            } else {
                List {
                    ForEach(viewModel.jobLogs, id: \.id) { log in
                        AdminJobLogRowView(log: log, timestampText: shortDate(log.timestamp))
                    }
                    if viewModel.jobLogs.count < viewModel.jobLogsTotal {
                        Button("Load more (\(viewModel.jobLogs.count) / \(viewModel.jobLogsTotal))") {
                            Task { await viewModel.loadMoreLogs() }
                        }
                        .buttonStyle(.borderless)
                        .foregroundStyle(Branding.accent)
                    }
                }
                .listStyle(.plain)
                .font(.system(.caption, design: .monospaced))
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }

    // MARK: - Books

    private var booksPanel: some View {
        VStack(spacing: 0) {
            uploadRow
                .padding([.horizontal, .top], 12)
                .padding(.bottom, 8)
            booksFilterRow
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            Divider()
            if viewModel.books.isEmpty {
                ContentUnavailableView("No books loaded", systemImage: "books.vertical",
                    description: Text("Upload an audiobook or wait for a scan to complete."))
            } else if viewModel.filteredBooks.isEmpty {
                ContentUnavailableView("No matching books", systemImage: "line.3.horizontal.decrease.circle",
                    description: Text("Adjust filters to find books quickly."))
            } else {
                booksManagementTable
            }
        }
        .sheet(item: $viewModel.selectedBook) { _ in
            bookEditSheet
        }
        .alert("Delete Book", isPresented: deleteConfirmationBinding, presenting: pendingDeleteBook) { book in
            Button("Delete", role: .destructive) {
                Task { await viewModel.deleteBook(book) }
                pendingDeleteBook = nil
            }
            Button("Cancel", role: .cancel) {
                pendingDeleteBook = nil
            }
        } message: { book in
            Text("Delete \"\(book.title)\"? This action cannot be undone.")
        }
    }

    private var deleteConfirmationBinding: Binding<Bool> {
        Binding(
            get: { pendingDeleteBook != nil },
            set: { isPresented in
                if !isPresented { pendingDeleteBook = nil }
            }
        )
    }

    private var booksFilterRow: some View {
        HStack(spacing: 8) {
            TextField("Filter title", text: $viewModel.booksFilterTitle)
                .textFieldStyle(.roundedBorder)

            TextField("Filter author", text: $viewModel.booksFilterAuthor)
                .textFieldStyle(.roundedBorder)

            TextField("Filter series", text: $viewModel.booksFilterSeries)
                .textFieldStyle(.roundedBorder)

            if viewModel.hasBookFilters {
                Button("Clear") {
                    viewModel.clearBookFilters()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
    }

    @ViewBuilder
    private var booksManagementTable: some View {
        #if os(macOS)
        Table(viewModel.filteredBooks) {
            TableColumn("Title") { book in
                Text(book.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
            }
            .width(min: 250)

            TableColumn("Author") { book in
                Text(book.author ?? "Unknown author")
                    .lineLimit(1)
                    .foregroundStyle(.secondary)
            }
            .width(min: 160, ideal: 220)

            TableColumn("Series") { book in
                Text(book.series ?? "-")
                    .lineLimit(1)
                    .foregroundStyle(.secondary)
            }
            .width(min: 150, ideal: 220)

            TableColumn("Index") { book in
                Text(book.seriesIndex.map(String.init) ?? "-")
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 60, ideal: 70, max: 80)

            TableColumn("Actions") { book in
                HStack(spacing: 6) {
                    Button("Edit") { viewModel.selectBookForEdit(book) }
                        .buttonStyle(.bordered)
                        .controlSize(.small)

                    Button("Delete") {
                        pendingDeleteBook = book
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .tint(.red)
                }
            }
            .width(min: 140, ideal: 150, max: 170)
        }
        #else
        List(viewModel.filteredBooks) { book in
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(book.title).font(.subheadline.weight(.semibold))
                    Text(book.author ?? "Unknown author")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(book.series ?? "-")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("#\(book.seriesIndex.map(String.init) ?? "-")")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                Button("Edit") { viewModel.selectBookForEdit(book) }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                Button("Delete") { pendingDeleteBook = book }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .tint(.red)
            }
        }
        .listStyle(.plain)
        #endif
    }

    private var uploadRow: some View {
        HStack(spacing: 10) {
            Picker("Language", selection: $viewModel.uploadLanguage) {
                Text("English").tag("en")
                Text("Français").tag("fr")
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 200)

            Button {
                isUploadPickerPresented = true
            } label: {
                if viewModel.isUploading {
                    ProgressView()
                } else {
                    Label("Upload", systemImage: "square.and.arrow.up")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.isUploading)

            if let jobId = viewModel.lastUploadedJobId {
                Text("Job: \(jobId.prefix(8))...")
                    .font(.caption).foregroundStyle(.green)
            }
        }
        .fileImporter(
            isPresented: $isUploadPickerPresented,
            allowedContentTypes: [.audio],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                Task { await viewModel.uploadBook(from: url) }
            case .failure:
                viewModel.setTransientError("Could not open selected file.")
            }
        }
    }

    // MARK: - Book Edit Sheet

    private var bookEditSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    metadataSection
                    coverSection
                    chaptersSection
                }
                .padding(20)
            }
            .navigationTitle("Edit Book")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { viewModel.selectedBook = nil }
                }
            }
        }
        .frame(minWidth: 560, minHeight: 560)
    }

    private var metadataSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Metadata")
            if let msg = viewModel.editBookMessage {
                Text(msg)
                    .font(.caption)
                    .foregroundStyle(msg.contains("Could") ? .red : .green)
            }
            Group {
                TextField("Title", text: $viewModel.editTitle)
                TextField("Author", text: $viewModel.editAuthor)
                TextField("Series", text: $viewModel.editSeries)
                TextField("Series Index", text: $viewModel.editSeriesIndex)
                TextField("Genre", text: $viewModel.editGenre)
                TextField("Tags (comma-separated)", text: $viewModel.editTags)
                TextField("Description", text: $viewModel.editDescription, axis: .vertical)
                    .lineLimit(3...6)
            }
            .textFieldStyle(.roundedBorder)

            Picker("Language", selection: $viewModel.editLanguage) {
                Text("English").tag("en")
                Text("Français").tag("fr")
            }
            .pickerStyle(.segmented)

            Button {
                Task { await viewModel.saveSelectedBookEdits() }
            } label: {
                if viewModel.isSavingMeta { ProgressView() }
                else { Text("Save Metadata") }
            }
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.isSavingMeta)
        }
        .padding(14)
        .background(Branding.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var coverSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Cover Image")
            if viewModel.isUploadingCover {
                ProgressView("Updating cover...")
            }
            HStack(spacing: 8) {
                TextField("Cover URL", text: $viewModel.coverURL)
                    .textFieldStyle(.roundedBorder)
                Button("Use URL") {
                    Task { await viewModel.uploadCoverFromURL(viewModel.coverURL) }
                }
                .buttonStyle(.bordered)
                .disabled(viewModel.coverURL.isEmpty || viewModel.isUploadingCover)
            }
            HStack(spacing: 8) {
                Button("Upload Image...") {
                    isCoverPickerPresented = true
                }
                .buttonStyle(.bordered)
                .disabled(viewModel.isUploadingCover)
                .fileImporter(
                    isPresented: $isCoverPickerPresented,
                    allowedContentTypes: [.image],
                    allowsMultipleSelection: false
                ) { result in
                    if case .success(let urls) = result, let url = urls.first {
                        let access = url.startAccessingSecurityScopedResource()
                        defer { if access { url.stopAccessingSecurityScopedResource() } }
                        if let data = try? Data(contentsOf: url) {
                            Task { await viewModel.uploadCoverFile(data: data, fileName: url.lastPathComponent) }
                        }
                    }
                }
            }
        }
        .padding(14)
        .background(Branding.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var chaptersSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                sectionHeader("Chapters")
                Spacer()
                Button { viewModel.addChapter() } label: {
                    Label("Add", systemImage: "plus")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            if viewModel.editChapters.isEmpty {
                Text("No chapters. Add one or save metadata to auto-detect.")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                VStack(spacing: 6) {
                    HStack(spacing: 0) {
                        Text("#").frame(width: 28, alignment: .leading)
                        Text("Title").frame(maxWidth: .infinity, alignment: .leading)
                        Text("Start (ms)").frame(width: 90, alignment: .trailing)
                        Text("End (ms)").frame(width: 90, alignment: .trailing)
                        Text("").frame(width: 32)
                    }
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)

                    ForEach(viewModel.editChapters.indices, id: \.self) { idx in
                        HStack(spacing: 6) {
                            Text("\(idx + 1)")
                                .frame(width: 22, alignment: .leading)
                                .font(.caption).foregroundStyle(.secondary)
                            TextField("Title", text: $viewModel.editChapters[idx].title)
                                .textFieldStyle(.roundedBorder)
                            TextField("Start", text: $viewModel.editChapters[idx].start)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 86)
                            TextField("End", text: $viewModel.editChapters[idx].end)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 86)
                            Button { viewModel.editChapters.remove(at: idx) } label: {
                                Image(systemName: "minus.circle").foregroundStyle(.red)
                            }
                            .buttonStyle(.borderless)
                            .frame(width: 28)
                        }
                    }
                }
            }
            Button {
                Task { await viewModel.saveChapters() }
            } label: {
                if viewModel.isSavingChapters { ProgressView() }
                else { Text("Save Chapters") }
            }
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.isSavingChapters)
        }
        .padding(14)
        .background(Branding.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Users

    private var usersPanel: some View {
        Group {
            if viewModel.users.isEmpty {
                ContentUnavailableView("No users loaded", systemImage: "person.2",
                    description: Text("User records will appear here once loaded."))
            } else {
                List(viewModel.users) { user in
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(displayName(for: user)).font(.subheadline.weight(.semibold))
                            Text(user.email).font(.caption).foregroundStyle(.secondary)
                            Text(user.role).font(.caption2).foregroundStyle(.tertiary)
                        }
                        Spacer()
                        if user.role != "admin" {
                            Button("Make Admin") {
                                Task { await viewModel.promoteUser(user) }
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title).font(.headline)
    }

    private func displayName(for user: AdminUserDTO) -> String {
        if let name = user.profile?.displayName, !name.isEmpty { return name }
        return user.email
    }

    private func shortDate(_ iso: String) -> String {
        if let d = AdminDateFormatters.iso8601WithMillis.date(from: iso) {
            return rel.localizedString(for: d, relativeTo: Date())
        }
        return String(iso.prefix(16))
    }

    private let rel: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f
    }()
}

// MARK: - AdminDateFormatters

private enum AdminDateFormatters {
    static let iso8601WithMillis: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
