import SwiftUI

struct AppSplashView: View {
    var body: some View {
        VStack(spacing: 14) {
            BrandLogoView(size: 128)
            Text("Audiobook Platform")
                .font(.title2.weight(.bold))
                .foregroundStyle(Branding.text)
            Text("Loading your library...")
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
