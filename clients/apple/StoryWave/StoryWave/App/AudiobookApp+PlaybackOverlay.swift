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
        VStack(spacing: 0) {
#if os(iOS)
            if shouldShowIOSPlaybackBanner {
                iosPlaybackStatusBanner
            }
#endif
            if container.playerViewModel.miniPlayerIsVisible() {
                miniPlayerDock
            }
        }
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
