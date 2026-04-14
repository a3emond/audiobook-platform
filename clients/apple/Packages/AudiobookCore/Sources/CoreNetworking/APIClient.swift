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

    public func postMultipart<Response: Decodable>(
        path: String,
        parts: [MultipartFormPart],
        fields: [String: String] = [:],
        headers: [String: String] = [:]
    ) async throws -> Response {
        let boundary = "Boundary-\(UUID().uuidString)"
        let body = try buildMultipartBody(parts: parts, fields: fields, boundary: boundary)

        var mergedHeaders = headers
        mergedHeaders["Content-Type"] = "multipart/form-data; boundary=\(boundary)"

        let data = try await request(
            method: "POST",
            path: path,
            body: body,
            headers: mergedHeaders
        )

        return try JSONDecoder().decode(Response.self, from: data)
    }

    public func delete(path: String, headers: [String: String] = [:]) async throws {
        _ = try await request(
            method: "DELETE",
            path: path,
            headers: headers
        )
    }

    public func deleteJSON<Response: Decodable>(
        path: String,
        headers: [String: String] = [:]
    ) async throws -> Response {
        let data = try await request(
            method: "DELETE",
            path: path,
            headers: headers
        )

        return try JSONDecoder().decode(Response.self, from: data)
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

    private func buildMultipartBody(
        parts: [MultipartFormPart],
        fields: [String: String],
        boundary: String
    ) throws -> Data {
        var body = Data()
        let lineBreak = "\r\n"

        for (name, value) in fields {
            guard let headerData = "--\(boundary)\(lineBreak)".data(using: .utf8),
                  let dispositionData = "Content-Disposition: form-data; name=\"\(name)\"\(lineBreak)\(lineBreak)".data(using: .utf8),
                  let valueData = "\(value)\(lineBreak)".data(using: .utf8) else {
                throw APIClientError.multipartEncodingFailed
            }
            body.append(headerData)
            body.append(dispositionData)
            body.append(valueData)
        }

        for part in parts {
            guard let headerData = "--\(boundary)\(lineBreak)".data(using: .utf8),
                  let dispositionData = "Content-Disposition: form-data; name=\"\(part.name)\"; filename=\"\(part.fileName)\"\(lineBreak)".data(using: .utf8),
                  let mimeTypeData = "Content-Type: \(part.mimeType)\(lineBreak)\(lineBreak)".data(using: .utf8),
                  let trailingBreak = lineBreak.data(using: .utf8) else {
                throw APIClientError.multipartEncodingFailed
            }

            body.append(headerData)
            body.append(dispositionData)
            body.append(mimeTypeData)
            body.append(part.data)
            body.append(trailingBreak)
        }

        guard let closingData = "--\(boundary)--\(lineBreak)".data(using: .utf8) else {
            throw APIClientError.multipartEncodingFailed
        }
        body.append(closingData)

        return body
    }
}

public struct MultipartFormPart {
    public let name: String
    public let fileName: String
    public let mimeType: String
    public let data: Data

    public init(name: String, fileName: String, mimeType: String, data: Data) {
        self.name = name
        self.fileName = fileName
        self.mimeType = mimeType
        self.data = data
    }
}

public enum APIClientError: Error {
    case invalidResponse
    case httpError(code: Int, message: String)
    case multipartEncodingFailed
}
