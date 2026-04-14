import Foundation
import AudiobookCore
import Combine

@MainActor
final class APIReachabilityViewModel: ObservableObject {
    @Published private(set) var isChecking = true
    @Published private(set) var isReachable = false
    @Published private(set) var message = "Checking API reachability..."

    private let apiClient: APIClient
    private var healthCheckTask: Task<Void, Never>?

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func checkNow() async {
        healthCheckTask?.cancel()
        
        healthCheckTask = Task {
            isChecking = true

            do {
                let health: APIHealthResponse = try await apiClient.getJSON(path: "api/v1/health")
                guard health.status.lowercased() == "ok" else {
                    isReachable = false
                    message = "API health check failed. Please try again."
                    isChecking = false
                    return
                }

                isReachable = true
                message = ""
                isChecking = false
            } catch {
                isReachable = false
                message = Self.mapError(error)
                isChecking = false
            }
        }
        
        await healthCheckTask?.value
    }

    private static func mapError(_ error: Error) -> String {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet:
                return "No internet connection. Connect to the internet and retry."
            case .timedOut:
                return "Connection timed out while contacting API."
            case .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed:
                return "Cannot reach API host. Verify gateway URL and connectivity."
            default:
                return "Unable to reach API. Please try again."
            }
        }

        if case let APIClientError.httpError(code, _) = error {
            return "API responded with status \(code)."
        }

        return "Unable to reach API. Please try again."
    }
}

private struct APIHealthResponse: Decodable {
    let status: String
    let version: String?
}
