import SwiftUI

struct PlayerBookDetailsSectionView: View {
    let series: String?
    let seriesIndex: Int?
    let genre: String?
    let tags: [String]
    let durationSeconds: Double
    let descriptionText: String?
    let onOpenSeries: (String) -> Void

    var body: some View {
        if hasDetails {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    Text("Book Details")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Spacer()

                    if let series = normalizedSeries {
                        Button("Open Series") {
                            onOpenSeries(series)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                }

                if let details = normalizedDescription {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("About this title")
                            .font(.headline)
                        Text(details)
                            .font(.subheadline)
                            .foregroundStyle(Branding.textMuted)
                    }
                }

                VStack(spacing: 10) {
                    detailRow(label: "Series", value: seriesLabel)
                    detailRow(label: "Genre", value: normalizedGenre)
                    detailRow(label: "Tags", value: normalizedTags)
                    detailRow(label: "Duration", value: formattedDuration)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Branding.surface.opacity(0.65))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var hasDetails: Bool {
        normalizedSeries != nil
            || normalizedGenre != nil
            || normalizedTags != nil
            || formattedDuration != nil
            || normalizedDescription != nil
    }

    private var normalizedSeries: String? {
        let value = series?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value, !value.isEmpty else { return nil }
        return value
    }

    private var seriesLabel: String? {
        guard let series = normalizedSeries else { return nil }
        if let seriesIndex, seriesIndex > 0 {
            return "\(series) - Book \(seriesIndex)"
        }
        return series
    }

    private var normalizedGenre: String? {
        let value = genre?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value, !value.isEmpty else { return nil }
        return value
    }

    private var normalizedTags: String? {
        let cleaned = tags
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !cleaned.isEmpty else { return nil }
        return cleaned.joined(separator: " • ")
    }

    private var normalizedDescription: String? {
        let value = descriptionText?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value, !value.isEmpty else { return nil }
        return value
    }

    private var formattedDuration: String? {
        let seconds = Int(durationSeconds.rounded())
        guard seconds > 0 else { return nil }

        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60

        if hours > 0 {
            return "\(hours) h \(minutes) min"
        }
        return "\(minutes) min"
    }

    private func detailRow(label: String, value: String?) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(label.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Branding.textMuted)
                .frame(width: 72, alignment: .leading)

            Text(value ?? "-")
                .font(.subheadline)
                .foregroundStyle(Branding.text)
                .multilineTextAlignment(.leading)

            Spacer(minLength: 0)
        }
    }
}
