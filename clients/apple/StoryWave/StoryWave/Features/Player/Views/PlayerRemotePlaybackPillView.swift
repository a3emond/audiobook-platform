import SwiftUI

struct PlayerRemotePlaybackPillView: View {
    let label: String
    let onTakeControl: () -> Void

    var body: some View {
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
            Button("Take Control", action: onTakeControl)
                .buttonStyle(.bordered)
                .controlSize(.small)
                .tint(.orange)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 14)
        .background(Color.orange.opacity(0.08))
        .clipShape(Capsule())
    }
}