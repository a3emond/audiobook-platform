import SwiftUI

struct APIHealthGateView: View {
    let isChecking: Bool
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            BrandLogoView(size: 120)
                .padding(.bottom, 8)

            Text(isChecking ? "Connecting to API" : "Cannot Reach API")
                .font(.title3.weight(.semibold))

            Text(message)
                .font(.body)
                .foregroundStyle(Branding.textMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)

            if isChecking {
                ProgressView()
                    .tint(Branding.accent)
                    .padding(.top, 6)
            } else {
                Button("Retry", action: onRetry)
                    .buttonStyle(.borderedProminent)
                    .tint(Branding.accent)
                    .padding(.top, 6)
            }
        }
        .padding(24)
    }
}
