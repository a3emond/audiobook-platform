import SwiftUI

struct PlayerView: View {
    @ObservedObject var viewModel: PlayerViewModel
    let onBack: () -> Void
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Button("Back") {
                    onBack()
                }
                .buttonStyle(.bordered)
                .tint(Branding.accent)

                Spacer()

                Text("Player")
                    .font(.title2)
            }

            Text(viewModel.state.title)
                .font(.title)
            if let author = viewModel.state.author {
                Text(author)
                    .foregroundStyle(Branding.textMuted)
            }

            if let activeDeviceLabel = viewModel.state.activeDeviceLabel {
                Text("Currently playing on \(activeDeviceLabel)")
                    .foregroundStyle(.orange)
            }

            if viewModel.state.isLoading {
                ProgressView("Loading playback...")
            }

            if let errorMessage = viewModel.state.errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
            }

            if viewModel.state.appliedRewind {
                Text("Resume rewind applied for context.")
                    .font(.subheadline)
                    .foregroundStyle(.orange)
            }

            if !viewModel.state.chapters.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Chapter")
                        .font(.headline)
                    Menu {
                        ForEach(Array(viewModel.state.chapters.enumerated()), id: \.offset) { index, chapter in
                            Button("\(chapter.index + 1). \(chapter.title)") {
                                viewModel.selectChapter(index)
                            }
                        }
                    } label: {
                        let chapter = viewModel.state.chapters[viewModel.state.currentChapterIndex]
                        HStack {
                            Text("\(chapter.index + 1). \(chapter.title)")
                            Spacer()
                            Text("Select")
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(Branding.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }

            if let streamURLString = viewModel.state.streamURLString {
                Text("Stream")
                    .font(.headline)
                Text(streamURLString)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }

            if viewModel.state.durationSeconds > 0 {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Position: \(Int(viewModel.state.positionSeconds))s / \(Int(viewModel.state.durationSeconds))s")
                        .font(.subheadline)
                    Slider(
                        value: Binding(
                            get: { viewModel.state.positionSeconds },
                            set: { viewModel.updatePosition($0) }
                        ),
                        in: 0...viewModel.state.durationSeconds
                    )
                    Text("Speed: \(String(format: "%.2fx", viewModel.state.playbackRate))")
                        .font(.subheadline)
                    HStack(spacing: 12) {
                        Button("-\(Int(viewModel.state.backwardJumpSeconds))s") {
                            viewModel.handleSkipBackwardMediaAction()
                        }
                        .buttonStyle(.bordered)

                        Button("+\(Int(viewModel.state.forwardJumpSeconds))s") {
                            viewModel.handleSkipForwardMediaAction()
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }

            Button(viewModel.state.isPlaying ? "Pause (Release Control)" : "Play (Take Control)") {
                if viewModel.state.isPlaying {
                    viewModel.pausePressed()
                } else {
                    viewModel.playPressed()
                }
            }
            .buttonStyle(.borderedProminent)

            Button {
                Task { await viewModel.saveProgress() }
            } label: {
                if viewModel.state.isSaving {
                    ProgressView()
                } else {
                    Text("Save Progress")
                }
            }
            .disabled(viewModel.state.isSaving || viewModel.state.durationSeconds <= 0)
            .buttonStyle(.borderedProminent)

            Spacer()
        }
        .padding()
        .background(Branding.surface.opacity(0.75))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding()
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .background {
                viewModel.pausePressed()
                Task { await viewModel.saveProgress() }
            }
        }
        .onDisappear {
            viewModel.pausePressed()
            Task { await viewModel.saveProgress() }
        }
    }
}
