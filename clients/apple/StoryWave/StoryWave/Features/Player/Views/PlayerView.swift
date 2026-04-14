import SwiftUI
import AudiobookCore

struct PlayerView: View {
    @ObservedObject var viewModel: PlayerViewModel
    let isAdmin: Bool
    let onEditMetadata: () -> Void
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

                // Cover art
                coverArt

                // Title / Author
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

                // Remote playback pill
                if let label = viewModel.state.activeDeviceLabel {
                    remoteDevicePill(label)
                }

                // Error / rewind notice
                if let error = viewModel.state.errorMessage {
                    Text(error).foregroundStyle(.red).font(.caption)
                }
                if viewModel.state.appliedRewind {
                    Text("Rewound for context")
                        .font(.caption).foregroundStyle(.orange)
                }

                // Chapter picker
                if !viewModel.state.chapters.isEmpty {
                    chapterPicker
                }

                // Progress slider
                if viewModel.state.durationSeconds > 0 {
                    progressSection
                }

                // Transport controls
                HStack(spacing: 28) {
                    Button { viewModel.handleSkipBackwardMediaAction() } label: {
                        Image(systemName: "gobackward.\(Int(viewModel.state.backwardJumpSeconds))")
                            .font(.title2)
                    }
                    .buttonStyle(.borderless)

                    Button {
                        if viewModel.state.isPlaying { viewModel.pausePressed() }
                        else { viewModel.playPressed() }
                    } label: {
                        Image(systemName: viewModel.state.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                            .font(.system(size: 64))
                            .foregroundStyle(Branding.accent)
                    }
                    .buttonStyle(.borderless)

                    Button { viewModel.handleSkipForwardMediaAction() } label: {
                        Image(systemName: "goforward.\(Int(viewModel.state.forwardJumpSeconds))")
                            .font(.title2)
                    }
                    .buttonStyle(.borderless)
                }

                Spacer(minLength: 16)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 20)
        }
        .background(Branding.surface.opacity(0.75))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding()
    }

    // MARK: - Cover Art

    @ViewBuilder
    private var coverArt: some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if let urlString = viewModel.state.coverURLString,
                   let url = URL(string: urlString) {
                    RemoteCoverImageView(
                        url: url,
                        fallbackText: viewModel.state.title.prefix(2).uppercased(),
                        fallbackFontSize: 44
                    )
                } else {
                    coverFallback
                }
            }

            if isAdmin {
                Button("Edit Metadata") {
                    onEditMetadata()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .padding(10)
            }
        }
        .frame(width: 220, height: 220)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.2), radius: 12, x: 0, y: 6)
    }

    private var coverFallback: some View {
        ZStack {
            Branding.surface
            Text(viewModel.state.title.prefix(2).uppercased())
                .font(.system(size: 44, weight: .bold))
                .foregroundStyle(Branding.accent)
        }
    }

    // MARK: - Remote Device Pill

    private func remoteDevicePill(_ label: String) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(Color.orange)
                .frame(width: 8, height: 8)
                .overlay(
                    Circle()
                        .stroke(Color.orange.opacity(0.4), lineWidth: 3)
                        .scaleEffect(1.6)
                )
            Text("Playing on \(label)")
                .font(.caption.bold())
                .foregroundStyle(.orange)
            Spacer()
            Button("Take Control") {
                viewModel.playPressed()
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .tint(.orange)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 14)
        .background(Color.orange.opacity(0.08))
        .clipShape(Capsule())
    }

    // MARK: - Chapter Picker

    private var chapterPicker: some View {
        HStack(spacing: 10) {
            Menu {
                ForEach(Array(viewModel.state.chapters.enumerated()), id: \.offset) { index, chapter in
                    Button("\(chapter.index + 1). \(chapter.title)") {
                        viewModel.selectChapter(index)
                    }
                }
            } label: {
                let chapter = viewModel.state.chapters[safe: viewModel.state.currentChapterIndex]
                HStack {
                    Image(systemName: "list.bullet")
                        .foregroundStyle(Branding.accent)
                    Text(chapter.map { "\($0.index + 1). \($0.title)" } ?? "Select Chapter")
                        .lineLimit(1)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Branding.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            Menu {
                Section("Progress tracking") {
                    Button {
                        viewModel.setProgressMode(.chapter)
                    }
                    label: {
                        Text("Track chapter progress\(viewModel.state.progressMode == .chapter ? " ✓" : "")")
                    }
                    Button {
                        viewModel.setProgressMode(.book)
                    }
                    label: {
                        Text("Track book progress\(viewModel.state.progressMode == .book ? " ✓" : "")")
                    }
                }

                Section("Night auto pause: \(viewModel.sleepTimerLabel())") {
                    Button {
                        viewModel.setSleepTimerMode(.off)
                    }
                    label: {
                        Text("Disabled\(viewModel.state.sleepTimerMode == .off ? " ✓" : "")")
                    }
                    Button {
                        viewModel.setSleepTimerMode(.fifteenMinutes)
                    }
                    label: {
                        Text("15 min\(viewModel.state.sleepTimerMode == .fifteenMinutes ? " ✓" : "")")
                    }
                    Button {
                        viewModel.setSleepTimerMode(.thirtyMinutes)
                    }
                    label: {
                        Text("30 min\(viewModel.state.sleepTimerMode == .thirtyMinutes ? " ✓" : "")")
                    }
                    Button {
                        viewModel.setSleepTimerMode(.fortyFiveMinutes)
                    }
                    label: {
                        Text("45 min\(viewModel.state.sleepTimerMode == .fortyFiveMinutes ? " ✓" : "")")
                    }
                    Button {
                        viewModel.setSleepTimerMode(.sixtyMinutes)
                    }
                    label: {
                        Text("1 h\(viewModel.state.sleepTimerMode == .sixtyMinutes ? " ✓" : "")")
                    }
                    Button {
                        viewModel.setSleepTimerMode(.chapter)
                    }
                    label: {
                        Text("End of current chapter\(viewModel.state.sleepTimerMode == .chapter ? " ✓" : "")")
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "moon.stars")
                        .font(.caption.bold())
                    Text("Timer")
                        .font(.caption.bold())
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(
                    Capsule()
                        .fill(viewModel.state.sleepTimerMode == .off ? Branding.surface : Color.orange.opacity(0.18))
                )
            }

            if let countdown = viewModel.state.sleepTimerCountdownText {
                Text(countdown)
                    .font(.caption.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(Color.orange.opacity(0.14))
                    .foregroundStyle(Color.orange)
                    .clipShape(Capsule())
            }
        }
    }

    // MARK: - Progress Section

    private var progressSection: some View {
        VStack(spacing: 6) {
            HStack {
                Text(viewModel.state.progressMode == .chapter ? "Chapter Progress" : "Book Progress")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
            }

            Slider(
                value: Binding(
                    get: { viewModel.progressSliderValue() },
                    set: { viewModel.onProgressSliderChanged($0) }
                ),
                in: viewModel.progressRangeMin()...viewModel.progressRangeMax()
            )
            .tint(Branding.accent)

            HStack {
                Text(viewModel.progressLeadingLabel())
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                Spacer()
                Text(viewModel.progressTrailingLabel())
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 16) {
                Button("Prev chapter") {
                    viewModel.goToPreviousChapter()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(!viewModel.canGoToPreviousChapter())

                if viewModel.state.playbackRate != 1.0 {
                    Text(String(format: "%.2fx", viewModel.state.playbackRate))
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }

                Button("Next chapter") {
                    viewModel.goToNextChapter()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(!viewModel.canGoToNextChapter())
            }
        }
    }
}
