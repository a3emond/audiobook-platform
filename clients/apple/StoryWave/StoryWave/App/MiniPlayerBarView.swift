import SwiftUI

/*
 Purpose:
 Compact playback dock shown in the app shell when a mini-player state is active.

 Notes:
 This view is a shell-level transport surface and not the full player UI.
*/
struct MiniPlayerBarView: View {
    // MARK: Inputs

    @ObservedObject var viewModel: PlayerViewModel
    let onOpenFullPlayer: () -> Void
    let onClose: () -> Void

    // MARK: View

    var body: some View {
        HStack(spacing: 8) {
            Button(action: onOpenFullPlayer) {
                HStack(spacing: 8) {
                    coverThumbnail

                    VStack(alignment: .leading, spacing: 2) {
                        if viewModel.state.isRemotePlaybackActive {
                            HStack(spacing: 5) {
                                Circle()
                                    .fill(Color.orange)
                                    .frame(width: 7, height: 7)
                                Text("Playing on \(viewModel.state.activeDeviceLabel ?? "another device")")
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.orange)
                                    .lineLimit(1)
                            }
                        }

                        Text(viewModel.miniPlayerTitle())
                            .font(.footnote.weight(.semibold))
                            .lineLimit(1)
                            .foregroundStyle(Branding.text)
                        Text(viewModel.miniPlayerAuthor())
                            .font(.caption2)
                            .lineLimit(1)
                            .foregroundStyle(Branding.textMuted)
                    }
                    Spacer()
                }
            }
            .buttonStyle(.plain)

            if viewModel.canControlMiniPlayerTransport() {
                Button {
                    if viewModel.state.isPlaying {
                        viewModel.pausePressed()
                    } else {
                        viewModel.playPressed()
                    }
                } label: {
                    Image(systemName: viewModel.state.isPlaying ? "pause.fill" : "play.fill")
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.borderless)
            } else if viewModel.state.isRemotePlaybackActive {
                Button("Listen Here") {
                    viewModel.listenHereFromMiniPlayer()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }

            Button(action: onClose) {
                Image(systemName: "xmark")
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.borderless)
            .foregroundStyle(Branding.textMuted)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Branding.surface.opacity(0.96))
        .overlay(
            Rectangle()
                .stroke(Branding.surfaceSoft, lineWidth: 1)
        )
    }

    // MARK: Subviews

    @ViewBuilder
    private var coverThumbnail: some View {
        BookCoverFrameView(
            url: viewModel.miniPlayerCoverURLString().flatMap(URL.init(string:)),
            fallbackText: viewModel.miniPlayerTitle().prefix(2).uppercased(),
            fallbackFontSize: 14,
            backgroundColor: Branding.surfaceSoft,
            size: CGSize(width: 32, height: 32),
            cornerRadius: 7,
            shadowColor: .clear,
            shadowRadius: 0
        )
    }
}
