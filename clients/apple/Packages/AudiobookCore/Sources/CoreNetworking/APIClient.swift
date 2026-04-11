import Foundation

public struct APIClient {
    public let baseURL: URL
    private let session: URLSession

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func makeURL(path: String) -> URL {
        baseURL.appendingPathComponent(path)
    }

    public func postJSON<Response: Decodable, Body: Encodable>(
        path: String,
        body: Body,
        headers: [String: String] = [:]
    ) async throws -> Response {
        try await requestJSON(
            method: "POST",
            path: path,
            body: body,
            headers: headers
        )
    }

    public func getJSON<Response: Decodable>(
        path: String,
        queryParams: [String: String] = [:],
        headers: [String: String] = [:]
    ) async throws -> Response {
        try await requestJSON(
            method: "GET",
            path: path,
            queryParams: queryParams,
            headers: headers
        )
    }

    public func putJSON<Response: Decodable, Body: Encodable>(
        path: String,
        body: Body,
        headers: [String: String] = [:]
    ) async throws -> Response {
        try await requestJSON(
            method: "PUT",
            path: path,
            body: body,
            headers: headers
        )
    }

    public func patchJSON<Response: Decodable, Body: Encodable>(
        path: String,
        body: Body,
        headers: [String: String] = [:]
    ) async throws -> Response {
        try await requestJSON(
            method: "PATCH",
            path: path,
            body: body,
            headers: headers
        )
    }

    public func delete(path: String, headers: [String: String] = [:]) async throws {
        _ = try await request(
            method: "DELETE",
            path: path,
            headers: headers
        )
    }

    private func requestJSON<Response: Decodable, Body: Encodable>(
        method: String,
        path: String,
        body: Body,
        headers: [String: String]
    ) async throws -> Response {
        let encodedBody = try JSONEncoder().encode(body)
        let data = try await request(
            method: method,
            path: path,
            body: encodedBody,
            headers: headers
        )

        return try JSONDecoder().decode(Response.self, from: data)
    }

    private func requestJSON<Response: Decodable>(
        method: String,
        path: String,
        queryParams: [String: String] = [:],
        headers: [String: String]
    ) async throws -> Response {
        let data = try await request(
            method: method,
            path: path,
            queryParams: queryParams,
            headers: headers
        )

        return try JSONDecoder().decode(Response.self, from: data)
    }

    private func request(
        method: String,
        path: String,
        queryParams: [String: String] = [:],
        body: Data? = nil,
        headers: [String: String]
    ) async throws -> Data {
        var url = makeURL(path: path)
        
        // Add query parameters if provided
        if !queryParams.isEmpty {
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            components?.queryItems = queryParams.map { URLQueryItem(name: $0.key, value: $0.value) }
            if let urlWithQuery = components?.url {
                url = urlWithQuery
            }
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }

        request.httpBody = body

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "http_\(httpResponse.statusCode)"
            throw APIClientError.httpError(code: httpResponse.statusCode, message: message)
        }

        return data
    }
}

public enum APIClientError: Error {
    case invalidResponse
    case httpError(code: Int, message: String)
}
