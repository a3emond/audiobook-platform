import SwiftUI
#if canImport(UIKit)
import UIKit
private typealias PlatformImage = UIImage
#elseif canImport(AppKit)
import AppKit
private typealias PlatformImage = NSImage
#endif

enum Branding {
    static let backgroundTop = Color(red: 0.04, green: 0.04, blue: 0.04)
    static let backgroundMid = Color(red: 0.03, green: 0.03, blue: 0.03)
    static let backgroundBottom = Color(red: 0.02, green: 0.02, blue: 0.02)
    static let surface = Color(red: 0.07, green: 0.07, blue: 0.07)
    static let surfaceSoft = Color(red: 0.10, green: 0.10, blue: 0.10)
    static let text = Color(red: 0.96, green: 0.93, blue: 0.85)
    static let textMuted = Color(red: 0.72, green: 0.68, blue: 0.59)
    static let accent = Color(red: 1.00, green: 0.55, blue: 0.00)
    static let accentHover = Color(red: 1.00, green: 0.63, blue: 0.18)

    static let backgroundGradient = LinearGradient(
        colors: [backgroundTop, backgroundMid, backgroundBottom],
        startPoint: .top,
        endPoint: .bottom
    )

    static var layeredBackground: some View {
        GeometryReader { proxy in
            let width = max(proxy.size.width, 1)
            let height = max(proxy.size.height, 1)
            let maxRadius = max(width, height)
            let logoSize = min(width, height) * 0.40

            ZStack {
                LinearGradient(
                    colors: [
                        Color(red: 0.04, green: 0.04, blue: 0.04),
                        Color(red: 0.027, green: 0.027, blue: 0.027),
                        Color(red: 0.02, green: 0.02, blue: 0.02),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )

                RadialGradient(
                    colors: [
                        Color(red: 1.00, green: 0.54, blue: 0.00).opacity(0.22),
                        .clear,
                    ],
                    center: UnitPoint(x: 0.15, y: -0.10),
                    startRadius: 0,
                    endRadius: maxRadius * 0.36
                )

                RadialGradient(
                    colors: [
                        Color(red: 1.00, green: 0.68, blue: 0.25).opacity(0.12),
                        .clear,
                    ],
                    center: UnitPoint(x: 0.84, y: 0.02),
                    startRadius: 0,
                    endRadius: maxRadius * 0.32
                )

                VStack(spacing: 0) {
                    BrandLogoView(size: logoSize)
                        .opacity(0.08)
                }
                .offset(y: height * 0.14)
                .allowsHitTesting(false)
            }
            .frame(width: width, height: height)
        }
    }
}

struct BrandLogoView: View {
    let size: CGFloat

    var body: some View {
        Group {
            if let image = brandImage(named: "logo_small") ?? brandImage(named: "logo") {
                image
                    .resizable()
                    .scaledToFit()
            } else {
                Image(systemName: "book.closed.fill")
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(Branding.accent)
            }
        }
        .frame(width: size, height: size)
    }

    private func brandImage(named name: String) -> Image? {
        #if canImport(UIKit)
        if let image = PlatformImage(named: name) {
            return Image(uiImage: image)
        }
        if let path = Bundle.main.path(forResource: name, ofType: "png"),
           let image = PlatformImage(contentsOfFile: path) {
            return Image(uiImage: image)
        }
        return nil
        #elseif canImport(AppKit)
        if let image = PlatformImage(named: NSImage.Name(name)) {
            return Image(nsImage: image)
        }
        if let path = Bundle.main.path(forResource: name, ofType: "png"),
           let image = PlatformImage(contentsOfFile: path) {
            return Image(nsImage: image)
        }
        return nil
        #else
        return nil
        #endif
    }
}

struct BrandCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(14)
            .background(Branding.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Branding.surfaceSoft, lineWidth: 1)
            )
    }
}

extension View {
    func brandCard() -> some View {
        modifier(BrandCardModifier())
    }
}
