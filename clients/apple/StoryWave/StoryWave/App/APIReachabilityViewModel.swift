import Foundation
import AudiobookCore
import Combine

/*
 Purpose:
 Small startup gate that verifies the backend API is reachable before showing the app shell.
*/
@MainActor
final class APIReachabilityViewModel: ObservableObject {
    // MARK: Published State

    @Published private(set) var isChecking = true
    @Published private(set) var isReachable = false
    @Published private(set) var message = "Checking API reachability..."

    // MARK: Dependencies

    private let apiClient: APIClient

    // MARK: Runtime State

    private var healthCheckTask: Task<Void, Never>?

    // MARK: Init

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    // MARK: Public API

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

    // MARK: Error Mapping

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

// MARK: - DTO

private struct APIHealthResponse: Decodable {
    let status: String
    let version: String?
}
