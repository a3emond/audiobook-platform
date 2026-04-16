import SwiftUI
import AudiobookCore

struct CollectionCard: View {
    let collection: CollectionDTO
    let previewURLs: [URL]
    // prefix(4) is done by caller; LazyVGrid is safe for 0-4 URLs
    private let gridColumns = [GridItem(.flexible(), spacing: 2), GridItem(.flexible(), spacing: 2)]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Group {
                if previewURLs.isEmpty {
                    RoundedRectangle(cornerRadius: 8).fill(Branding.surface)
                } else {
                    LazyVGrid(columns: gridColumns, spacing: 2) {
                        ForEach(previewURLs.prefix(4), id: \.absoluteString) { url in
                            AsyncImage(url: url) { phase in
                                if case .success(let img) = phase {
                                    img.resizable().aspectRatio(1, contentMode: .fill)
                                } else {
                                    Branding.surface
                                }
                            }
                            .aspectRatio(1, contentMode: .fill)
                            .clipped()
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .frame(height: 90)

            VStack(alignment: .leading, spacing: 2) {
                Text(collection.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                    .foregroundStyle(Branding.text)
                Text("\(collection.bookIds.count) book\(collection.bookIds.count == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(Branding.textMuted)
            }
        }
        .padding(12)
        .background(Branding.surface)
        .cornerRadius(12)
    }
}
