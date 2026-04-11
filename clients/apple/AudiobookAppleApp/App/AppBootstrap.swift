import Foundation

@MainActor
final class AppBootstrap: ObservableObject {
    @Published private(set) var initialized = false

    func initialize() async {
        try? await Task.sleep(nanoseconds: 900_000_000)
        initialized = true
    }
}
