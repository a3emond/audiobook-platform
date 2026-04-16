import Foundation
import Combine
import OSLog

/*
 Purpose:
 Lightweight startup coordinator for app-shell readiness.

 Notes:
 This does not load feature data. It only stages startup checks and cache warm-ups so
 first-render transitions feel smoother and deterministic.
*/
@MainActor
final class AppBootstrap: ObservableObject {
    // MARK: Types

    struct Diagnostics {
        let startedAt: Date
        let finishedAt: Date
        let elapsedMs: Int
    }

    enum Stage: Equatable {
        case idle
        case preflight
        case warmingCaches
        case finalizing
        case ready
        case failed(String)
    }

    // MARK: Published State

    @Published private(set) var initialized = false
    @Published private(set) var stage: Stage = .idle
    @Published private(set) var diagnostics: Diagnostics?

    // MARK: Runtime State

    private let logger = Logger(subsystem: "pro.aedev.StoryWave", category: "AppBootstrap")
    private let minimumSplashNanoseconds: UInt64
    private let startupTimeoutNanoseconds: UInt64
    private var initializeTask: Task<Void, Never>?

    // MARK: Init

    init(
        minimumSplashNanoseconds: UInt64 = 350_000_000,
        startupTimeoutNanoseconds: UInt64 = 8_000_000_000
    ) {
        self.minimumSplashNanoseconds = minimumSplashNanoseconds
        self.startupTimeoutNanoseconds = startupTimeoutNanoseconds
    }

    // MARK: Public API

    func initialize() async {
        if initialized {
            return
        }

        if let initializeTask {
            await initializeTask.value
            return
        }

        let task = Task { [weak self] in
            guard let self else { return }
            await self.runBootstrapPipeline()
        }

        initializeTask = task
        await task.value
    }

    var statusMessage: String {
        switch stage {
        case .idle:
            return "Preparing app startup..."
        case .preflight:
            return "Running startup checks..."
        case .warmingCaches:
            return "Warming core caches..."
        case .finalizing:
            return "Finalizing launch..."
        case .ready:
            return "Ready"
        case .failed(let message):
            return message
        }
    }

    // MARK: Pipeline

    private func runBootstrapPipeline() async {
        let startedAt = Date()
        stage = .preflight
        logger.info("Bootstrap started")

        do {
            async let minimumSplashTask: Void = Task.sleep(nanoseconds: minimumSplashNanoseconds)
            async let startupTask: Void = runStartupWorkWithTimeout()

            _ = try await (minimumSplashTask, startupTask)

            stage = .finalizing
            await Task.yield()

            initialized = true
            stage = .ready

            let finishedAt = Date()
            diagnostics = Diagnostics(
                startedAt: startedAt,
                finishedAt: finishedAt,
                elapsedMs: Int(finishedAt.timeIntervalSince(startedAt) * 1000)
            )

            logger.info("Bootstrap finished in \(self.diagnostics?.elapsedMs ?? 0) ms")
        } catch {
            initialized = true
            stage = .failed("Startup checks failed; continuing with safe defaults.")

            let finishedAt = Date()
            diagnostics = Diagnostics(
                startedAt: startedAt,
                finishedAt: finishedAt,
                elapsedMs: Int(finishedAt.timeIntervalSince(startedAt) * 1000)
            )

            logger.error("Bootstrap failed: \(error.localizedDescription, privacy: .public)")
        }

        initializeTask = nil
    }

    private func runStartupWorkWithTimeout() async throws {
        try await withTimeout(nanoseconds: startupTimeoutNanoseconds) { [weak self] in
            guard let self else { return }
            stage = .warmingCaches
            await warmStartupCaches()
        }
    }

    private func warmStartupCaches() async {
        // Warm startup-only memory state that improves first-render smoothness.
        _ = Locale.current.identifier
        _ = Locale.preferredLanguages.first
        _ = TimeZone.current.identifier

        let defaults = UserDefaults.standard
        _ = defaults.string(forKey: "player_apple_device_id")

        // Trigger static initialization once to avoid first-use hitching.
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        _ = formatter.string(from: Date())
    }

    private func withTimeout<T>(nanoseconds: UInt64, operation: @escaping () async throws -> T) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask {
                try await operation()
            }

            group.addTask {
                try await Task.sleep(nanoseconds: nanoseconds)
                throw CancellationError()
            }

            guard let firstResult = try await group.next() else {
                throw CancellationError()
            }

            group.cancelAll()
            return firstResult
        }
    }
}


