import SwiftUI
import AudiobookCore

struct ProfileStatsView: View {
    @ObservedObject var viewModel: ProfileStatsViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if viewModel.isLoading {
                    ProgressView("Loading statistics...")
                        .frame(maxWidth: .infinity, alignment: .center)
                } else {
                    if let stats = viewModel.stats {
                        HStack(spacing: 12) {
                            StatCard(label: "Total", value: formatDuration(stats.lifetime.totalListeningSeconds))
                            StatCard(label: "Completed", value: "\(stats.lifetime.completedBooksCount)")
                        }

                        HStack(spacing: 12) {
                            StatCard(label: "7 days", value: formatDuration(stats.rolling.last7DaysListeningSeconds))
                            StatCard(label: "30 days", value: formatDuration(stats.rolling.last30DaysListeningSeconds))
                        }
                    }

                    Text("Listening History")
                        .font(.headline)

                    if viewModel.sessions.isEmpty {
                        Text("No listening sessions yet.")
                            .foregroundStyle(Branding.textMuted)
                    } else {
                        LazyVStack(spacing: 10) {
                            ForEach(viewModel.sessions) { session in
                                SessionRow(session: session, title: viewModel.title(for: session.bookId))
                                    .onAppear {
                                        Task { await viewModel.loadMoreIfNeeded(currentSession: session) }
                                    }
                            }
                        }
                    }

                    if viewModel.isLoadingMore {
                        ProgressView()
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                }

                if let error = viewModel.errorMessage {
                    Text(error)
                        .foregroundStyle(.red)
                }
            }
            .padding(16)
        }
        .task {
            if viewModel.stats == nil && !viewModel.isLoading {
                await viewModel.loadInitial()
            }
        }
    }

    private func formatDuration(_ seconds: Int) -> String {
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        }
        return "\(minutes)m"
    }
}

private struct SessionRow: View {
    let session: ListeningSessionDTO
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.semibold))
            Text("\(session.listenedSeconds / 60) min listened")
                .font(.caption)
                .foregroundStyle(Branding.textMuted)
            Text(session.startedAt.prefix(19).replacingOccurrences(of: "T", with: " "))
                .font(.caption2)
                .foregroundStyle(Branding.textMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Branding.surface)
        .cornerRadius(10)
    }
}

private struct StatCard: View {
    let label: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(Branding.textMuted)
            Text(value)
                .font(.headline)
                .foregroundStyle(Branding.text)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(Branding.surface)
        .cornerRadius(10)
    }
}
