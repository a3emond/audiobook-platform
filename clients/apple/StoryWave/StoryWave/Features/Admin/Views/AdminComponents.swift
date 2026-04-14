import SwiftUI
import AudiobookCore

struct AdminStatCardView: View {
    let label: String
    let value: Int
    let icon: String

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(Branding.accent)
            Text("\(value)")
                .font(.title.bold())
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(14)
        .background(Branding.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

struct AdminJobStatusBadgeView: View {
    let status: String

    var body: some View {
        let color: Color = {
            switch status {
            case "done": return .green
            case "running": return .blue
            case "retrying": return .orange
            case "failed": return .red
            default: return .secondary
            }
        }()

        return Text(status)
            .font(.caption2.bold())
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

struct AdminJobLogRowView: View {
    let log: JobLogDTO
    let timestampText: String

    var body: some View {
        let color: Color = {
            switch log.level {
            case "error": return .red
            case "warn": return .orange
            case "info": return .primary
            default: return .secondary
            }
        }()

        return HStack(alignment: .top, spacing: 8) {
            Text(log.level.prefix(1).uppercased())
                .font(.caption2.bold().monospaced())
                .foregroundStyle(color)
                .frame(width: 14)
            VStack(alignment: .leading, spacing: 2) {
                Text(log.message)
                    .foregroundStyle(color)
                Text(timestampText)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 2)
    }
}
