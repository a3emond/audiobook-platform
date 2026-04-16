import SwiftUI

/*
 Purpose:
 Lightweight launch splash shown while bootstrap pipeline is running.
*/
struct AppSplashView: View {
    // MARK: Inputs

    let message: String

    // MARK: Init

    init(message: String = "Loading your library...") {
        self.message = message
    }

    // MARK: View

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
