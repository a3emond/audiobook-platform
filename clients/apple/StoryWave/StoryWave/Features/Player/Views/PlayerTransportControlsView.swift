import SwiftUI

struct PlayerTransportControlsView: View {
    let backwardJumpSeconds: Double
    let forwardJumpSeconds: Double
    let isPlaying: Bool
    let onSkipBackward: () -> Void
    let onPlayPause: () -> Void
    let onSkipForward: () -> Void

    var body: some View {
        HStack(spacing: 28) {
            Button(action: onSkipBackward) {
                Image(systemName: "gobackward.\(Int(backwardJumpSeconds))")
                    .font(.title2)
            }
            .buttonStyle(.borderless)

            Button(action: onPlayPause) {
                Image(systemName: isPlaying ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(Branding.accent)
            }
            .buttonStyle(.borderless)

            Button(action: onSkipForward) {
                Image(systemName: "goforward.\(Int(forwardJumpSeconds))")
                    .font(.title2)
            }
            .buttonStyle(.borderless)
        }
    }
}