import Foundation
import Combine

/*
 Purpose:
 Post-construction wiring helpers for AppContainer.

 Why separate file:
 Object graph construction stays in the factory, while runtime wiring for adapters and
 shell observation is grouped here.
*/
extension AppContainer {
    // MARK: Post-Construction Wiring

    func configurePostConstructionWiring(using dependencies: AppContainerDependencies) {
        configureRemoteCommandRouting(using: dependencies)
        configurePlatformAdapters()
        configureShellReactivity()
        configureRealtimeEventRouting()
        setRealtimeLifecycleActive(authViewModel.state.isAuthenticated)
    }

    // MARK: Wiring Details

    private func configureRemoteCommandRouting(using dependencies: AppContainerDependencies) {
        // Set PlayerViewModel as the actions handler for remote commands.
        dependencies.remoteCommandsAdapter.playerActions = playerViewModel

        // Wire audio interruption callbacks to player actions.
        #if os(iOS)
        (audioSessionAdapter as? IOSAudioSessionAdapter)?.interruptionHandler = playerViewModel
        #else
        (audioSessionAdapter as? MacOSAudioSessionAdapter)?.interruptionHandler = playerViewModel
        #endif
    }

    private func configurePlatformAdapters() {
        keyboardCommandsAdapter.registerKeyboardCommands()
        windowingAdapter.configureWindow()

        #if os(macOS)
        // On macOS, keyboard/menu commands are routed through the menu adapter.
        (keyboardCommandsAdapter as? MacMenuCommandsAdapter)?.playerActions = playerViewModel
        #endif
    }

    private func configureShellReactivity() {
        // Keep shell-level views reactive to key feature state transitions.
        forwardObjectWillChange(from: authViewModel)
        forwardObjectWillChange(from: playerViewModel)
        forwardObjectWillChange(from: profileViewModel)
    }

    private func forwardObjectWillChange(from source: some ObservableObject) {
        source.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
    }
}
