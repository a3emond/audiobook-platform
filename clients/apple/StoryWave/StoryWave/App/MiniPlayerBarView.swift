import SwiftUI

struct MiniPlayerBarView: View {
    @ObservedObject var viewModel: PlayerViewModel
    let onOpenFullPlayer: () -> Void
    let onClose: () -> Void

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

    @ViewBuilder
    private var coverThumbnail: some View {
        if let coverURLString = viewModel.miniPlayerCoverURLString(),
           let url = URL(string: coverURLString) {
            RemoteCoverImageView(
                url: url,
                fallbackText: viewModel.miniPlayerTitle().prefix(2).uppercased(),
                fallbackFontSize: 14,
                backgroundColor: Branding.surfaceSoft
            )
            .frame(width: 32, height: 32)
            .clipShape(RoundedRectangle(cornerRadius: 7))
        } else {
            placeholderCover
                .frame(width: 32, height: 32)
                .clipShape(RoundedRectangle(cornerRadius: 7))
        }
    }

    private var placeholderCover: some View {
        ZStack {
            Branding.surfaceSoft
            Image(systemName: "book.closed.fill")
                .foregroundStyle(Branding.accent)
                .font(.system(size: 14, weight: .semibold))
        }
    }
}
