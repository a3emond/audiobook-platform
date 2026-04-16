import SwiftUI

struct PlayerProgressSectionView: View {
    @ObservedObject var viewModel: PlayerViewModel

    var body: some View {
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