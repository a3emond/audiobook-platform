import SwiftUI

struct AppSplashView: View {
    let message: String

    init(message: String = "Loading your library...") {
        self.message = message
    }

    var body: some View {
        VStack(spacing: 14) {
            BrandLogoView(size: 128)
            Text("Audiobook Platform")
                .font(.title2.weight(.bold))
                .foregroundStyle(Branding.text)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Branding.textMuted)
            ProgressView()
                .tint(Branding.accent)
        }
        .padding(24)
        .brandCard()
        .frame(maxWidth: 420)
    }
}
