import SwiftUI
import AudiobookCore

/*
 Purpose:
 Playback overlay composition for the root shell (mini player dock and remote-playback banner).

 Why separate file:
 Keeps AudiobookApp focused on flow routing while playback chrome lives in one place.
*/
extension AudiobookApp {
    // MARK: Playback Overlay

    @ViewBuilder
    var rootPlaybackOverlay: some View {
        VStack(spacing: 8) {
#if os(iOS)
            if shouldShowIOSPlaybackBanner {
                iosPlaybackStatusBanner
            }
#endif
            if container.playerViewModel.miniPlayerIsVisible() {
                miniPlayerDock
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
        .padding(.bottom, 6)
        .background(Branding.surface.opacity(0.96))
        .overlay(
            Rectangle()
                .stroke(Branding.surfaceSoft, lineWidth: 1)
        )
    }

    // MARK: Overlay Views

    var miniPlayerDock: some View {
        MiniPlayerBarView(
            viewModel: container.playerViewModel,
            onOpenFullPlayer: {
                guard let targetBookId = container.playerViewModel.miniPlayerBookId() else { return }
                selectedBookId = targetBookId
                if container.playerViewModel.state.bookId != targetBookId {
                    let targetTitle = container.playerViewModel.miniPlayerTitle()
                    Task { await container.playerViewModel.load(bookId: targetBookId, title: targetTitle) }
                }
            },
            onClose: { container.playerViewModel.reset() }
        )
    }

#if os(iOS)
    var iosPlaybackStatusBanner: some View {
        let state = container.playerViewModel.state

        return HStack(spacing: 10) {
            Circle()
                .fill(Color.orange)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 2) {
                Text("Playing on \(state.activeDeviceLabel ?? "another device")")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .lineLimit(1)

                Text(state.remoteTitle ?? (state.title.isEmpty ? "Active playback" : state.title))
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Branding.text)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            if state.isRemotePlaybackActive {
                Button("Take Control") {
                    container.playerViewModel.listenHereFromMiniPlayer()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }

            Button("Open") {
                openActivePlaybackFromOverlay()
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Branding.surface.opacity(0.96))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Branding.surfaceSoft, lineWidth: 1)
        )
    }
#endif

    var rootPlaybackOverlayMaxWidth: CGFloat {
#if os(iOS)
        340
#else
        420
#endif
    }

    // MARK: Overlay Conditions

    var shouldShowRootPlaybackOverlay: Bool {
#if os(iOS)
        selectedBookId == nil && (container.playerViewModel.miniPlayerIsVisible() || shouldShowIOSPlaybackBanner)
#else
        false
#endif
    }

    var shouldShowMacPlaybackDock: Bool {
#if os(macOS)
        selectedBookId == nil && container.playerViewModel.miniPlayerIsVisible()
#else
        false
#endif
    }

    var shouldShowIOSPlaybackBanner: Bool {
#if os(iOS)
        let state = container.playerViewModel.state
        return state.isRemotePlaybackActive
            || !(state.activeDeviceLabel ?? "").isEmpty
            || !(state.remoteBookId ?? "").isEmpty
            || !(state.remoteTitle ?? "").isEmpty
#else
        false
#endif
    }

    func openActivePlaybackFromOverlay() {
        guard let targetBookId = container.playerViewModel.miniPlayerBookId() else { return }
        selectedBookId = targetBookId
        if container.playerViewModel.state.bookId != targetBookId {
            let targetTitle = container.playerViewModel.state.remoteTitle
                ?? container.playerViewModel.miniPlayerTitle()
            Task { await container.playerViewModel.load(bookId: targetBookId, title: targetTitle) }
        }
    }
}

#if os(iOS)
/// Reactive iOS playback cover overlay.
///
/// Declared as a standalone `View` struct (not an `AudiobookApp` extension) so that
/// `@ObservedObject` directly subscribes to `PlayerViewModel`. This means it re-renders
/// whenever playback state changes, independent of `AppContainer`'s own publish cycle.
struct IOSPlaybackBar: View {
    @ObservedObject var playerViewModel: PlayerViewModel
    var selectedBookId: String?
    let onOpen: (String, String) -> Void
    let onClose: () -> Void
    @State private var isExpanded = false
    @State private var isStatusPulseAnimating = false

    private var isVisible: Bool {
        selectedBookId == nil && playerViewModel.miniPlayerIsVisible()
    }

    private var showsRemoteBanner: Bool {
        let state = playerViewModel.state
        return state.isRemotePlaybackActive
            || !(state.activeDeviceLabel ?? "").isEmpty
            || !(state.remoteBookId ?? "").isEmpty
            || !(state.remoteTitle ?? "").isEmpty
    }

    private var coverURL: URL? {
        playerViewModel.miniPlayerCoverURLString().flatMap(URL.init(string:))
    }

    private var statusTitle: String {
        if showsRemoteBanner {
            return "Playing on \(playerViewModel.state.activeDeviceLabel ?? "another device")"
        }
        return playerViewModel.state.isPlaying ? "Now playing" : "Ready to resume"
    }

    private var statusColor: Color {
        showsRemoteBanner ? .orange : .blue
    }

    private var visibilityAccentColor: Color {
        showsRemoteBanner
            ? Color(red: 0.35, green: 0.95, blue: 0.5)
            : Color(red: 0.28, green: 0.8, blue: 0.95)
    }

    private var shouldPulseStatus: Bool {
        showsRemoteBanner || playerViewModel.state.isPlaying
    }

    private var drawerWidth: CGFloat {
        242
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottomTrailing) {
                if isVisible {
                    playbackDrawer(proxy: proxy)
                        .padding(.trailing, 14)
                        .padding(.bottom, proxy.safeAreaInsets.bottom + 78)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
            .allowsHitTesting(isVisible)
        }
        .animation(.easeInOut(duration: 0.2), value: isVisible)
        .animation(.spring(response: 0.28, dampingFraction: 0.86), value: isExpanded)
        .ignoresSafeArea(edges: .bottom)
        .onChange(of: isVisible) { _, visible in
            if !visible {
                isExpanded = false
            }
        }
        .onAppear {
            isStatusPulseAnimating = true
        }
    }

    private func playbackDrawer(proxy: GeometryProxy) -> some View {
        ZStack(alignment: .trailing) {
            expandedDrawer
                .frame(width: drawerWidth)
                .offset(x: isExpanded ? 0 : drawerWidth - 56)

            collapsedHandle
                .offset(x: isExpanded ? 10 : 0)
                .opacity(isExpanded ? 0 : 1)
                .allowsHitTesting(!isExpanded)
        }
        .frame(width: drawerWidth, alignment: .trailing)
    }

    private var collapsedHandle: some View {
        Button {
            isExpanded = true
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "chevron.left")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white.opacity(0.9))

                BookCoverFrameView(
                    url: coverURL,
                    fallbackText: playerViewModel.miniPlayerTitle().prefix(2).uppercased(),
                    fallbackFontSize: 18,
                    size: CGSize(width: 52, height: 52),
                    cornerRadius: 14,
                    shadowColor: .clear,
                    shadowRadius: 0
                )

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        statusIndicatorDot

                        Text(showsRemoteBanner ? "Remote" : "Now Playing")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(statusColor)
                            .lineLimit(1)
                    }

                    Text(playerViewModel.miniPlayerTitle())
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }

                Spacer(minLength: 0)
            }
            .padding(.vertical, 8)
            .padding(.leading, 10)
            .padding(.trailing, 12)
            .frame(width: 176)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Color.black.opacity(0.82))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(visibilityAccentColor.opacity(0.95), lineWidth: 1.8)
            )
            .shadow(color: visibilityAccentColor.opacity(0.26), radius: 12, y: 0)
            .shadow(color: .black.opacity(0.28), radius: 14, y: 8)
        }
        .buttonStyle(.plain)
    }

    private var expandedDrawer: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                HStack(spacing: 6) {
                    statusIndicatorDot

                    Text(statusTitle)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(statusColor)
                        .lineLimit(1)
                }

                Spacer(minLength: 0)

                Button {
                    isExpanded = false
                } label: {
                    Image(systemName: "chevron.right.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.white.opacity(0.9))
                }
                .buttonStyle(.plain)

                Button(action: onClose) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.white.opacity(0.9))
                }
                .buttonStyle(.plain)
            }

            Button {
                guard let bookId = playerViewModel.miniPlayerBookId() else { return }
                onOpen(bookId, playerViewModel.miniPlayerTitle())
            } label: {
                HStack(spacing: 12) {
                    BookCoverFrameView(
                        url: coverURL,
                        fallbackText: playerViewModel.miniPlayerTitle().prefix(2).uppercased(),
                        fallbackFontSize: 22,
                        size: CGSize(width: 78, height: 78),
                        cornerRadius: 16,
                        shadowColor: .black.opacity(0.2),
                        shadowRadius: 8,
                        shadowY: 4
                    )

                    VStack(alignment: .leading, spacing: 5) {
                        Text(playerViewModel.miniPlayerTitle())
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.white)
                            .multilineTextAlignment(.leading)
                            .lineLimit(3)

                        Text(playerViewModel.miniPlayerAuthor())
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.78))
                            .lineLimit(2)
                    }

                    Spacer(minLength: 0)
                }
            }
            .buttonStyle(.plain)

            HStack(spacing: 8) {
                if playerViewModel.state.isRemotePlaybackActive {
                    Button("Listen Here") {
                        playerViewModel.listenHereFromMiniPlayer()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                } else if playerViewModel.canControlMiniPlayerTransport() {
                    Button(playerViewModel.state.isPlaying ? "Pause" : "Play") {
                        if playerViewModel.state.isPlaying {
                            playerViewModel.pausePressed()
                        } else {
                            playerViewModel.playPressed()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                }

                Button("Open") {
                    guard let bookId = playerViewModel.miniPlayerBookId() else { return }
                    onOpen(bookId, playerViewModel.miniPlayerTitle())
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(14)
        .frame(width: drawerWidth)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.black.opacity(0.86))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(visibilityAccentColor.opacity(0.92), lineWidth: 1.8)
        )
        .shadow(color: visibilityAccentColor.opacity(0.24), radius: 12, y: 0)
        .shadow(color: .black.opacity(0.32), radius: 16, y: 10)
    }

    private var statusIndicatorDot: some View {
        ZStack {
            Circle()
                .stroke(statusColor.opacity(shouldPulseStatus ? 0.45 : 0), lineWidth: 6)
                .scaleEffect(shouldPulseStatus && isStatusPulseAnimating ? 1.7 : 1.0)
                .opacity(shouldPulseStatus && isStatusPulseAnimating ? 0 : 0.5)

            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
        }
        .frame(width: 10, height: 10)
        .animation(
            shouldPulseStatus
                ? .easeOut(duration: 1.15).repeatForever(autoreverses: false)
                : .default,
            value: isStatusPulseAnimating
        )
    }
}
#endif
