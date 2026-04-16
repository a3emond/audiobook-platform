import SwiftUI

struct BookCoverFrameView<Overlay: View>: View {
    let url: URL?
    let fallbackText: String
    let fallbackFontSize: CGFloat
    let backgroundColor: Color
    let size: CGSize
    let cornerRadius: CGFloat
    let shadowColor: Color
    let shadowRadius: CGFloat
    let shadowX: CGFloat
    let shadowY: CGFloat
    let overlay: Overlay

    init(
        url: URL?,
        fallbackText: String,
        fallbackFontSize: CGFloat,
        backgroundColor: Color = Branding.surface,
        size: CGSize,
        cornerRadius: CGFloat,
        shadowColor: Color = .black.opacity(0.25),
        shadowRadius: CGFloat = 4,
        shadowX: CGFloat = 0,
        shadowY: CGFloat = 2,
        @ViewBuilder overlay: () -> Overlay
    ) {
        self.url = url
        self.fallbackText = fallbackText
        self.fallbackFontSize = fallbackFontSize
        self.backgroundColor = backgroundColor
        self.size = size
        self.cornerRadius = cornerRadius
        self.shadowColor = shadowColor
        self.shadowRadius = shadowRadius
        self.shadowX = shadowX
        self.shadowY = shadowY
        self.overlay = overlay()
    }

    var body: some View {
        ZStack {
            RemoteCoverImageView(
                url: url,
                fallbackText: fallbackText,
                fallbackFontSize: fallbackFontSize,
                backgroundColor: backgroundColor
            )
            .frame(width: size.width, height: size.height)
            .clipped()

            overlay
                .frame(width: size.width, height: size.height)
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        .shadow(color: shadowColor, radius: shadowRadius, x: shadowX, y: shadowY)
    }
}

extension BookCoverFrameView where Overlay == EmptyView {
    init(
        url: URL?,
        fallbackText: String,
        fallbackFontSize: CGFloat,
        backgroundColor: Color = Branding.surface,
        size: CGSize,
        cornerRadius: CGFloat,
        shadowColor: Color = .black.opacity(0.25),
        shadowRadius: CGFloat = 4,
        shadowX: CGFloat = 0,
        shadowY: CGFloat = 2
    ) {
        self.init(
            url: url,
            fallbackText: fallbackText,
            fallbackFontSize: fallbackFontSize,
            backgroundColor: backgroundColor,
            size: size,
            cornerRadius: cornerRadius,
            shadowColor: shadowColor,
            shadowRadius: shadowRadius,
            shadowX: shadowX,
            shadowY: shadowY
        ) {
            EmptyView()
        }
    }
}

struct BookProgressPillView: View {
    let progressPercent: Double
    var font: Font = .caption2.bold()
    var horizontalPadding: CGFloat = 6
    var verticalPadding: CGFloat = 3

    var body: some View {
        Text("\(normalizedPercent)%")
            .font(font)
            .padding(.horizontal, horizontalPadding)
            .padding(.vertical, verticalPadding)
            .background(Color.black.opacity(0.76))
            .foregroundStyle(.white)
            .clipShape(Capsule())
    }

    private var clampedProgress: Double {
        min(1, max(0, progressPercent))
    }

    private var normalizedPercent: Int {
        guard clampedProgress > 0 else { return 0 }
        if clampedProgress >= 1 { return 100 }
        return min(99, max(1, Int((clampedProgress * 100).rounded())))
    }
}

struct BookProgressBarView: View {
    let progressPercent: Double
    var height: CGFloat = 4

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(Color.black.opacity(0.35))
                Rectangle()
                    .fill(Branding.accent)
                    .frame(width: geometry.size.width * clampedProgress)
            }
        }
        .frame(height: height)
    }

    private var clampedProgress: CGFloat {
        let raw = min(1, max(0, progressPercent))
        if raw <= 0 {
            return 0
        }
        if raw >= 1 {
            return 1
        }
        // Match web cover-tile behavior: ensure started books still show a visible progress sliver.
        return CGFloat(max(0.01, min(0.99, raw)))
    }
}

struct BookCompletedBadgeView: View {
    var iconFont: Font = .caption.bold()
    var titleFont: Font = .caption2.weight(.semibold)
    var spacing: CGFloat = 4
    var horizontalPadding: CGFloat = 8
    var verticalPadding: CGFloat = 6
    var cornerRadius: CGFloat = 8

    var body: some View {
        VStack(spacing: spacing) {
            Text("✓")
                .font(iconFont)
            Text("Completed")
                .font(titleFont)
                .lineLimit(1)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, horizontalPadding)
        .padding(.vertical, verticalPadding)
        .background(Color.black.opacity(0.68))
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    }
}