import SwiftUI
import AudiobookCore

struct PlayerView: View {
    @ObservedObject var viewModel: PlayerViewModel
    let isAdmin: Bool
    let onEditMetadata: () -> Void
    let onOpenSeries: (String) -> Void
    let onBack: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .center, spacing: 20) {
                // Navigation bar
                HStack {
                    Button(action: onBack) {
                        Image(systemName: "chevron.left")
                        Text("Library")
                    }
                    .buttonStyle(.borderless)
                    .foregroundStyle(Branding.accent)
                    Spacer()
                }

                PlayerCoverArtView(
                    coverURLString: viewModel.state.coverURLString,
                    title: viewModel.state.title,
                    progressPercent: coverProgressPercent,
                    isCompleted: viewModel.state.isCompleted,
                    isAdmin: isAdmin,
                    onMarkCompleted: {
                        Task { await viewModel.markCompletedPressed() }
                    },
                    onEditMetadata: onEditMetadata
                )

                VStack(spacing: 6) {
                    Text(viewModel.state.title)
                        .font(.title2.bold())
                        .multilineTextAlignment(.center)
                    if let author = viewModel.state.author {
                        Text(author)
                            .font(.subheadline)
                            .foregroundStyle(Branding.textMuted)
                    }
                }

                if let label = viewModel.state.activeDeviceLabel {
                    PlayerRemotePlaybackPillView(label: label) {
                        viewModel.playPressed()
                    }
                }

                if let error = viewModel.state.errorMessage {
                    Text(error).foregroundStyle(.red).font(.caption)
                }
                if viewModel.state.appliedRewind {
                    Text("Rewound for context")
                        .font(.caption).foregroundStyle(.orange)
                }

                if !viewModel.state.chapters.isEmpty {
                    PlayerChapterControlsView(viewModel: viewModel)
                }

                if viewModel.state.durationSeconds > 0 {
                    PlayerProgressSectionView(viewModel: viewModel)
                }

                PlayerTransportControlsView(
                    backwardJumpSeconds: viewModel.state.backwardJumpSeconds,
                    forwardJumpSeconds: viewModel.state.forwardJumpSeconds,
                    isPlaying: viewModel.state.isPlaying,
                    onSkipBackward: { viewModel.handleSkipBackwardMediaAction() },
                    onPlayPause: {
                        if viewModel.state.isPlaying { viewModel.pausePressed() }
                        else { viewModel.playPressed() }
                    },
                    onSkipForward: { viewModel.handleSkipForwardMediaAction() }
                )

                PlayerBookDetailsSectionView(
                    series: viewModel.state.series,
                    seriesIndex: viewModel.state.seriesIndex,
                    genre: viewModel.state.genre,
                    tags: viewModel.state.tags,
                    durationSeconds: viewModel.state.durationSeconds,
                    descriptionText: viewModel.state.descriptionText,
                    onOpenSeries: onOpenSeries
                )

                Spacer(minLength: 16)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 20)
        }
        .background(Branding.surface.opacity(0.75))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding()
    }

    private var coverProgressPercent: Double? {
        if viewModel.state.isCompleted {
            return 1
        }

        if viewModel.state.durationSeconds > 0,
           viewModel.state.durationSeconds.isFinite,
           viewModel.state.positionSeconds.isFinite {
            return min(1, max(0, viewModel.state.positionSeconds / viewModel.state.durationSeconds))
        }

        if let chapter = viewModel.state.chapters[safe: viewModel.state.currentChapterIndex] {
            let chapterStart = max(0, Double(chapter.start))
            let chapterEnd = max(chapterStart + 1, Double(chapter.end))
            let chapterDuration = chapterEnd - chapterStart
            let chapterPosition = min(max(0, viewModel.state.positionSeconds - chapterStart), chapterDuration)
            return min(1, max(0.01, chapterPosition / chapterDuration))
        }

        return viewModel.state.positionSeconds > 0 ? 0.01 : nil
    }
}
