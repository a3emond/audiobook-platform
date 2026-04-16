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
    private var isConnected = false

    public init(baseURL: URL, session: URLSession = .shared) {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        let wsScheme = components?.scheme == "https" ? "wss" : "ws"
        components?.scheme = wsScheme
        components?.path = "/ws"
        self.websocketURL = components?.url ?? baseURL.appendingPathComponent("ws")
        self.session = session
    }

    public func connect() {

        if isConnected {
            return
        }

        task = session.webSocketTask(with: websocketURL)
        task?.resume()
        isConnected = true
        receiveLoop()
    }

    @discardableResult
    public func connect(onEvent: @escaping EventHandler) -> UUID {
        let id = subscribe(onEvent)
        connect()
        return id
    }

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

    public func disconnect() {
        reconnectTask?.cancel()
        reconnectTask = nil
        isConnected = false
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    public func send(type: String, payload: [String: Any]) {
        guard isConnected, let task else {
            return
        }

        let packet: [String: Any] = ["type": type, "payload": payload]
        guard let data = try? JSONSerialization.data(withJSONObject: packet),
              let text = String(data: data, encoding: .utf8)
        else {
            return
        }

        task.send(.string(text)) { [weak self] error in
            if error != nil {
                self?.scheduleReconnect()
            }
        }
    }

    private func receiveLoop() {
        guard let task else {
            return
        }

        task.receive { [weak self] result in
            guard let self else {
                return
            }

            switch result {
            case .failure:
                self.scheduleReconnect()
            case .success(let message):
                if case .string(let text) = message,
                   let data = text.data(using: .utf8),
                   let envelope = try? JSONDecoder().decode(RealtimeEventEnvelope.self, from: data) {
                    self.emit(envelope)
                }

                self.receiveLoop()
            @unknown default:
                self.scheduleReconnect()
            }
        }
    }

    private func scheduleReconnect() {
        guard isConnected else {
            return
        }

        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard let self, self.isConnected else {
                return
            }

            self.task?.cancel(with: .goingAway, reason: nil)
            self.task = self.session.webSocketTask(with: self.websocketURL)
            self.task?.resume()
            self.receiveLoop()
        }
    }

    private func emit(_ envelope: RealtimeEventEnvelope) {
        listenersLock.lock()
        let handlers = Array(listeners.values)
        listenersLock.unlock()

        for handler in handlers {
            handler(envelope)
        }
    }
}
