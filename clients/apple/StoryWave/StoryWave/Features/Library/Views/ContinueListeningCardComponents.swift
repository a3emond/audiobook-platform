import SwiftUI

/*
 Purpose:
 Reusable visual pieces for Continue Listening compact cards.

 Notes:
 The mini progress bar here is fixed-width by design (card width), which avoids width
 ambiguity during LazyHStack layout and keeps card rendering consistent across positions.
*/
struct ContinueListeningCardOverlayView: View {
    let title: String
    let cardSize: CGFloat
    let progressPercent: Double

    var body: some View {
        ZStack {
            titleLayer
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)

            VStack(spacing: 0) {
                Spacer()
                ContinueListeningMiniProgressBar(
                    width: cardSize,
                    progressPercent: progressPercent,
                    height: 3
                )
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            .zIndex(3)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
    }

    private var titleLayer: some View {
        VStack(spacing: 0) {
            Spacer()

            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .lineLimit(1)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 6)
                .padding(.bottom, 7)
                .padding(.top, 14)
                .background(
                    LinearGradient(
                        colors: [Color.black.opacity(0), Color.black.opacity(0.92)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
        }
    }
}

struct ContinueListeningMiniProgressBar: View {
    let width: CGFloat
    let progressPercent: Double
    var height: CGFloat = 3

    var body: some View {
        ZStack(alignment: .leading) {
            Rectangle()
                .fill(Color.black.opacity(0.35))
                .frame(width: width, height: height)
            Rectangle()
                .fill(Branding.accent)
                .frame(width: width * LibraryProgressMath.uiClampedProgress(progressPercent), height: height)
        }
        .frame(width: width, height: height, alignment: .leading)
    }
}
