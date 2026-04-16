import Foundation
import AudiobookCore

// MARK: - URL & Time Utilities

extension PlayerViewModel {

    // MARK: Authenticated URL

    /// Builds an authenticated media URL by appending the current access token as a query parameter.
    func authenticatedMediaURLString(for path: String) -> String {
        let baseURL = repository.streamURL(streamPath: path)
        guard let token = authService.accessToken else {
            return baseURL.absoluteString
        }
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        let existing = components?.queryItems ?? []
        components?.queryItems = existing + [URLQueryItem(name: "access_token", value: token)]
        return components?.url?.absoluteString ?? baseURL.absoluteString
    }

    // MARK: Time Normalization

    /// Converts raw server time values to seconds, compensating for the API mixing
    /// millisecond and second units.  Uses the chapter endpoint range as a reference
    /// when available; falls back to the 200 000-unit heuristic.
    func normalizedServerSeconds(_ raw: Double, chapterMaxRaw: Int?) -> Double {
        guard raw.isFinite, raw > 0 else { return 0 }

        if let chapterMaxRaw, chapterMaxRaw > 0 {
            let chapterSecondsIfMs = Double(chapterMaxRaw) / 1000.0
            if chapterSecondsIfMs > 0, raw > chapterSecondsIfMs * 3 {
                return raw / 1000.0
            }
        }
        return raw > 200_000 ? raw / 1000.0 : raw
    }
}

// MARK: - RealtimeJSONValue Helpers

extension Dictionary where Key == String, Value == RealtimeJSONValue {

    func string(_ key: String) -> String? {
        if case .string(let text) = self[key] { return text }
        return nil
    }

    func bool(_ key: String) -> Bool? {
        if case .bool(let flag) = self[key] { return flag }
        return nil
    }
}
