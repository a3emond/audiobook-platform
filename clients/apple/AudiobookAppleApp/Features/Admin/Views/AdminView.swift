import SwiftUI

struct AdminView: View {
    @ObservedObject var viewModel: AdminViewModel

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Picker("Panel", selection: $viewModel.selectedPanel) {
                    ForEach(AdminViewModel.AdminPanel.allCases) { panel in
                        Text(panel.rawValue).tag(panel)
                    }
                }
                .pickerStyle(.segmented)

                if viewModel.isLoading {
                    ProgressView("Loading admin data...")
                } else if let error = viewModel.errorMessage {
                    Text(error)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    panelView
                }

                Spacer(minLength: 0)
            }
            .padding(20)
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
        case .overview:
            overviewPanel
        case .jobs:
            jobsPanel
        case .users:
            usersPanel
        }
    }

    private var overviewPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let overview = viewModel.overview {
                Text("Users: \(overview.counts.users)")
                Text("Books: \(overview.counts.books)")
                Text("Collections: \(overview.counts.collections)")
                Text("Jobs: \(overview.counts.jobs)")
            } else {
                Text("No overview data")
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var jobsPanel: some View {
        List(viewModel.jobs) { job in
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(job.type ?? "job")
                        .font(.headline)
                    Text(job.status)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if ["queued", "running", "retrying"].contains(job.status) {
                    Button("Cancel") {
                        Task { await viewModel.cancelJob(job) }
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .listStyle(.plain)
    }

    private var usersPanel: some View {
        List(viewModel.users) { user in
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(user.profile?.displayName?.isEmpty == false ? user.profile?.displayName ?? user.email : user.email)
                        .font(.headline)
                    Text(user.role)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if user.role != "admin" {
                    Button("Make admin") {
                        Task { await viewModel.promoteUser(user) }
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
        .listStyle(.plain)
    }
}
