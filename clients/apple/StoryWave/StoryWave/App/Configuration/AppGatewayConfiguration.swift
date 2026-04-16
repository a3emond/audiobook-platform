import Foundation

/*
 Purpose:
 Resolve API gateway URL from environment/Info.plist with a safe default.
*/
enum AppGatewayConfiguration {
    static func resolveGatewayURL() -> URL {
        if let configured = ProcessInfo.processInfo.environment["API_BASE_URL"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !configured.isEmpty,
           let url = URL(string: configured) {
            return url
        }

        if let configured = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
           !configured.isEmpty,
           let url = URL(string: configured) {
            return url
        }

        return URL(string: "https://audiobook.aedev.pro")!
    }
}
