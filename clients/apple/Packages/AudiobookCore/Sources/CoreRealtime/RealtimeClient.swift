import Foundation

public struct RealtimeEventEnvelope: Decodable {
    public let type: String
    public let ts: String?
    public let payload: [String: RealtimeJSONValue]?
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
}

public final class RealtimeClient {
    public typealias EventHandler = (RealtimeEventEnvelope) -> Void

    private let session: URLSession
    private let websocketURL: URL
    private var task: URLSessionWebSocketTask?
    private var reconnectTask: Task<Void, Never>?
    private var onEvent: EventHandler?
    private var isConnected = false

    public init(baseURL: URL, session: URLSession = .shared) {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        let wsScheme = components?.scheme == "https" ? "wss" : "ws"
        components?.scheme = wsScheme
        components?.path = "/ws"
        self.websocketURL = components?.url ?? baseURL.appendingPathComponent("ws")
        self.session = session
    }

    public func connect(onEvent: @escaping EventHandler) {
        self.onEvent = onEvent

        if isConnected {
            return
        }

        task = session.webSocketTask(with: websocketURL)
        task?.resume()
        isConnected = true
        receiveLoop()
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
                    self.onEvent?(envelope)
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
}
