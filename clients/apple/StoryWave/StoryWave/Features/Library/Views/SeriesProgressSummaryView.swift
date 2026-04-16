import SwiftUI

struct SeriesProgressSummaryView: View {
    let snapshot: SeriesProgressSnapshot
    var compact: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 6 : 8) {
            Text(primaryStatusText)
                .font(compact ? .caption.weight(.semibold) : .subheadline.weight(.semibold))
                .foregroundStyle(snapshot.progressPercent == nil ? Branding.textMuted : Branding.text)

            Text(secondaryStatusText)
                .font(compact ? .caption2 : .caption)
                .foregroundStyle(Branding.textMuted)

            BookProgressBarView(progressPercent: snapshot.progressPercent ?? 0, height: compact ? 4 : 5)
                .frame(maxWidth: compact ? 180 : .infinity)
                .clipShape(Capsule())
        }
    }

    private var primaryStatusText: String {
        guard let progressPercent = snapshot.progressPercent else {
            return "Not started yet"
        }
        return "\(Int(progressPercent * 100))% complete"
    }

    private var secondaryStatusText: String {
        "\(snapshot.completedBooksCount)/\(snapshot.totalBooksCount) books completed"
    }
}