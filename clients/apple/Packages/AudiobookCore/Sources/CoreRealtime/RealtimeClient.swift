import Foundation

public struct RealtimeEventEnvelope: Decodable {
    public let type: String
    public let ts: String?
    public let payload: [String: RealtimeJSONValue]?

    public func decodePayload<T: Decodable>(as type: T.Type) -> T? {
        guard let payload else { return nil }
        let jsonObject = payload.mapValues { $0.foundationValue }
        guard JSONSerialization.isValidJSONObject(jsonObject),
              let data = try? JSONSerialization.data(withJSONObject: jsonObject) else {
            return nil
        }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}

public enum RealtimeJSONValue: Decodable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: RealtimeJSONValue])
    case array([RealtimeJSONValue])
    case null

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self = .null
            return
        }

        if let value = try? container.decode(String.self) {
            self = .string(value)
            return
        }

        if let value = try? container.decode(Bool.self) {
            self = .bool(value)
            return
        }

        if let value = try? container.decode(Double.self) {
            self = .number(value)
            return
        }

        if let value = try? container.decode([String: RealtimeJSONValue].self) {
            self = .object(value)
            return
        }

        if let value = try? container.decode([RealtimeJSONValue].self) {
            self = .array(value)
            return
        }

        throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid realtime payload value")
    }

    public var foundationValue: Any {
        switch self {
        case .string(let value):
            return value
        case .number(let value):
            return value
        case .bool(let value):
            return value
        case .object(let object):
            return object.mapValues { $0.foundationValue }
        case .array(let values):
            return values.map { $0.foundationValue }
        case .null:
            return NSNull()
        }
    }
}

public final class RealtimeClient {
    public typealias EventHandler = (RealtimeEventEnvelope) -> Void

    private let session: URLSession
    private let websocketURL: URL
    private var task: URLSessionWebSocketTask?
    private var reconnectTask: Task<Void, Never>?
    private var listeners: [UUID: EventHandler] = [:]
    private let listenersLock = NSLock()

    // Intentionally separate from task existence: `true` means we *want* a live
    // connection. If the underlying URLSessionWebSocketTask is silently torn down
    // by the OS (common on iOS after background), the flag stays `true` so
    // forceReconnect() can re-establish without external intervention.
    private var isConnected = false

    // Outbound messages queued while the socket is being re-established.
    // Flushed in the order they were enqueued as soon as the new task is ready.
    private var sendQueue: [String] = []
    private let sendQueueLock = NSLock()

    public init(baseURL: URL, session: URLSession = .shared) {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        let wsScheme = components?.scheme == "https" ? "wss" : "ws"
        components?.scheme = wsScheme
        components?.path = "/ws"
        self.websocketURL = components?.url ?? baseURL.appendingPathComponent("ws")
        self.session = session
    }

    // MARK: - Lifecycle

    public func connect() {
        guard !isConnected else { return }
        isConnected = true
        openSocket()
    }

    @discardableResult
    public func connect(onEvent: @escaping EventHandler) -> UUID {
        let id = subscribe(onEvent)
        connect()
        return id
    }

    public func disconnect() {
        reconnectTask?.cancel()
        reconnectTask = nil
        isConnected = false
        sendQueueLock.lock()
        sendQueue.removeAll()
        sendQueueLock.unlock()
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    // MARK: - Subscription

    @discardableResult
    public func subscribe(_ handler: @escaping EventHandler) -> UUID {
        let id = UUID()
        listenersLock.lock()
        listeners[id] = handler
        listenersLock.unlock()
        return id
    }

    public func unsubscribe(_ id: UUID) {
        listenersLock.lock()
        listeners.removeValue(forKey: id)
        listenersLock.unlock()
    }

    // MARK: - Send

    public func send(type: String, payload: [String: Any]) {
        let packet: [String: Any] = ["type": type, "payload": payload]
        guard let data = try? JSONSerialization.data(withJSONObject: packet),
              let text = String(data: data, encoding: .utf8)
        else { return }

        guard isConnected else { return }

        // If there is no live task (silently torn down by iOS) queue the message
        // and force a reconnect — it will be flushed once the socket is back.
        guard let task, task.state == .running else {
            enqueue(text)
            forceReconnect()
            return
        }

        task.send(.string(text)) { [weak self] error in
            if let error {
                // Message failed: queue it for retry and reconnect.
                self?.enqueue(text)
                self?.scheduleReconnect()
                _ = error  // suppress unused-var warning
            }
        }
    }

    // MARK: - Internal

    private func openSocket() {
        task?.cancel(with: .goingAway, reason: nil)
        let newTask = session.webSocketTask(with: websocketURL)
        task = newTask
        newTask.resume()
        receiveLoop(for: newTask)
        flushSendQueue()
    }

    private func enqueue(_ text: String) {
        sendQueueLock.lock()
        // Keep the queue bounded: drop oldest if it grows unreasonably.
        if sendQueue.count >= 64 { sendQueue.removeFirst() }
        sendQueue.append(text)
        sendQueueLock.unlock()
    }

    private func flushSendQueue() {
        sendQueueLock.lock()
        let pending = sendQueue
        sendQueue.removeAll()
        sendQueueLock.unlock()

        guard !pending.isEmpty, let task else { return }

        for text in pending {
            task.send(.string(text)) { [weak self] error in
                if error != nil {
                    self?.scheduleReconnect()
                }
            }
        }
    }

    private func receiveLoop(for knownTask: URLSessionWebSocketTask) {
        knownTask.receive { [weak self] result in
            guard let self else { return }
            // Ignore callbacks from a stale task after reconnect.
            guard knownTask === self.task else { return }

            switch result {
            case .failure:
                self.scheduleReconnect()
            case .success(let message):
                if case .string(let text) = message,
                   let data = text.data(using: .utf8),
                   let envelope = try? JSONDecoder().decode(RealtimeEventEnvelope.self, from: data) {
                    self.emit(envelope)
                }
                self.receiveLoop(for: knownTask)
            @unknown default:
                self.scheduleReconnect()
            }
        }
    }

    /// Schedules a reconnect after a short back-off delay.
    private func scheduleReconnect() {
        guard isConnected else { return }

        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 s back-off
            guard let self, self.isConnected else { return }
            self.openSocket()
        }
    }

    /// Reconnects immediately without a delay (used when send() finds no live task).
    private func forceReconnect() {
        guard isConnected else { return }
        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            guard let self, self.isConnected else { return }
            self.openSocket()
        }
    }

    private func emit(_ envelope: RealtimeEventEnvelope) {
        listenersLock.lock()
        let handlers = Array(listeners.values)
        listenersLock.unlock()
        for handler in handlers { handler(envelope) }
    }
}
