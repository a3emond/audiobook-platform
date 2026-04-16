import SwiftUI

struct LibraryHeaderView: View {
    @Binding var query: String
    let onQueryChange: (String) -> Void
    let onSignOut: () async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                BrandLogoView(size: 28)
                Text("Library")
                    .font(.largeTitle.weight(.bold))
                Spacer()
                Button { Task { await onSignOut() } } label: {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .imageScale(.large)
                        .foregroundStyle(Branding.textMuted)
                }
                .buttonStyle(.plain)
                .help("Sign Out")
            }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Branding.textMuted)
                TextField("Search books...", text: Binding(
                    get: { query },
                    set: { onQueryChange($0) }
                ))
                .textFieldStyle(.plain)
                if !query.isEmpty {
                    Button { onQueryChange("") } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(Branding.textMuted)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
            .background(Branding.surface)
            .cornerRadius(10)
        }
    }
}
