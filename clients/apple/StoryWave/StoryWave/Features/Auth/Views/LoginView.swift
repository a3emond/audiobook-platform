import SwiftUI
import AuthenticationServices
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

struct LoginView: View {
    @ObservedObject var viewModel: AuthViewModel
    @State private var oauthConfig = OAuthConfig.current

    var body: some View {
        GeometryReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(spacing: 16) {
                    BrandLogoView(size: proxy.size.height < 760 ? 68 : 84)
                    Text("Sign In")
                        .font(.title.weight(.semibold))
                    Text("Welcome back to your library")
                        .font(.subheadline)
                        .foregroundStyle(Branding.textMuted)

                    Picker("Auth Mode", selection: Binding(
                        get: { viewModel.state.mode },
                        set: { viewModel.switchMode($0) }
                    )) {
                        Text("Login").tag(AuthViewState.Mode.login)
                        Text("Register").tag(AuthViewState.Mode.register)
                    }
                    .pickerStyle(.segmented)

                    VStack(spacing: 12) {
                        TextField("Email", text: Binding(
                            get: { viewModel.state.email },
                            set: { viewModel.updateEmail($0) }
                        ))
                        .padding(10)
                        .background(Branding.surface)
                        .cornerRadius(6)

                        if !viewModel.state.email.isEmpty && !isValidEmail(viewModel.state.email) {
                            Text("Please enter a valid email address")
                                .font(.caption)
                                .foregroundStyle(.orange)
                        }

                        if viewModel.state.mode == .register {
                            TextField("Display Name (optional)", text: Binding(
                                get: { viewModel.state.displayName },
                                set: { viewModel.updateDisplayName($0) }
                            ))
                            .padding(10)
                            .background(Branding.surface)
                            .cornerRadius(6)
                        }

                        SecureField("Password", text: Binding(
                            get: { viewModel.state.password },
                            set: { viewModel.updatePassword($0) }
                        ))
                        .padding(10)
                        .background(Branding.surface)
                        .cornerRadius(6)

                        if viewModel.state.mode == .register {
                            SecureField("Confirm Password", text: Binding(
                                get: { viewModel.state.confirmPassword },
                                set: { viewModel.updateConfirmPassword($0) }
                            ))
                            .padding(10)
                            .background(Branding.surface)
                            .cornerRadius(6)

                            Picker("Language", selection: Binding(
                                get: { viewModel.state.preferredLocale },
                                set: { viewModel.updatePreferredLocale($0) }
                            )) {
                                Text("English").tag("en")
                                Text("Français").tag("fr")
                            }
                            .pickerStyle(.segmented)
                        }

                        if let errorMessage = viewModel.state.errorMessage {
                            Text(errorMessage)
                                .foregroundStyle(.red)
                                .font(.footnote)
                        }

                        Button {
                            Task {
                                if viewModel.state.mode == .login {
                                    await viewModel.login()
                                } else {
                                    await viewModel.register()
                                }
                            }
                        } label: {
                            if viewModel.state.isLoading {
                                ProgressView()
                            } else {
                                Text(viewModel.state.mode == .login ? "Login" : "Create Account")
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(Branding.accent)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .disabled(isLoginDisabled)

                        Divider().overlay(Branding.surfaceSoft)

                        VStack(spacing: 10) {
                            SignInWithAppleButton(.continue) { request in
                                request.requestedScopes = [.fullName, .email]
                            } onCompletion: { result in
                                handleAppleSignInResult(result)
                            }
                            .signInWithAppleButtonStyle(.black)
                            .frame(height: 44)
                            .disabled(viewModel.state.oauthLoadingProvider != nil)

                            if viewModel.state.oauthLoadingProvider == .apple {
                                ProgressView().controlSize(.small)
                            }

                            Button {
                                Task { await startGoogleOAuth() }
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "globe")
                                    Text("Continue with Google")
                                    if viewModel.state.oauthLoadingProvider == .google {
                                        ProgressView().controlSize(.small)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.white)
                            .foregroundStyle(.black)
                            .disabled(!oauthConfig.googleEnabled || viewModel.state.oauthLoadingProvider != nil)

                            if !oauthConfig.googleEnabled {
                                Text("Google OAuth is not configured in this build.")
                                    .font(.caption)
                                    .foregroundStyle(Branding.textMuted)
                            }
                        }
                    }
                    .brandCard()

                    if viewModel.state.isAuthenticated {
                        Text("Authenticated")
                            .foregroundStyle(.green)

                        Button("Sign Out") {
                            Task { await viewModel.signOut() }
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.top, 16)
                .padding(.bottom, 16)
                .frame(maxWidth: 420)
                .frame(maxWidth: .infinity)
                .frame(minHeight: proxy.size.height)
            }
            #if os(iOS)
            .scrollDismissesKeyboard(.interactively)
            #endif
        }
    }
    
    private var isLoginDisabled: Bool {
        viewModel.state.isLoading || 
        viewModel.state.oauthLoadingProvider != nil ||
        viewModel.state.email.isEmpty || 
        viewModel.state.password.isEmpty ||
        (viewModel.state.mode == .register && viewModel.state.confirmPassword.isEmpty) ||
        (viewModel.state.mode == .register && viewModel.state.password != viewModel.state.confirmPassword) ||
        !isValidEmail(viewModel.state.email)
    }
    
    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"
        return NSPredicate(format: "SELF MATCHES %@", emailRegex).evaluate(with: email)
    }

    private func startGoogleOAuth() async {
        guard oauthConfig.googleEnabled else {
            viewModel.setErrorMessage("Google OAuth is not configured in this build.")
            return
        }

        do {
            let idToken = try await GoogleOAuthSession.startSignIn(config: oauthConfig)
            await viewModel.loginWithOAuth(provider: .google, idToken: idToken)
        } catch GoogleOAuthSessionError.cancelled {
            // User cancelled popup; do nothing.
        } catch GoogleOAuthSessionError.providerError(let reason) {
            viewModel.setErrorMessage("Google Sign-In failed (\(reason)).")
        } catch {
            viewModel.setErrorMessage("Google Sign-In failed. Please try again.")
        }
    }

    private func handleAppleSignInResult(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let idToken = String(data: tokenData, encoding: .utf8),
                  !idToken.isEmpty else {
                viewModel.setErrorMessage("Apple Sign-In did not return an identity token.")
                return
            }

            Task {
                await viewModel.loginWithOAuth(provider: .apple, idToken: idToken)
            }
        case .failure(let error):
            if let authorizationError = error as? ASAuthorizationError,
               authorizationError.code == .canceled {
                return
            }

            viewModel.setErrorMessage("Apple Sign-In failed. Please try again.")
        }
    }
}

private struct OAuthConfig {
    let googleClientId: String
    let googleRedirectURI: String
    let apiBaseURL: URL

    var googleEnabled: Bool {
        !googleClientId.isEmpty && !googleRedirectURI.isEmpty
    }

    var callbackScheme: String? {
        URL(string: googleRedirectURI)?.scheme
    }

    static var current: OAuthConfig {
        let env = ProcessInfo.processInfo.environment

        let googleClientId = (env["GOOGLE_CLIENT_ID"] ?? Bundle.main.object(forInfoDictionaryKey: "GOOGLE_CLIENT_ID") as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let googleRedirectURI = (env["GOOGLE_REDIRECT_URI"] ?? Bundle.main.object(forInfoDictionaryKey: "GOOGLE_REDIRECT_URI") as? String ?? "storywave://oauth/google")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let apiBaseURL = resolveAPIBaseURL(env: env)

        return OAuthConfig(
            googleClientId: googleClientId,
            googleRedirectURI: googleRedirectURI,
            apiBaseURL: apiBaseURL
        )
    }

    private static func resolveAPIBaseURL(env: [String: String]) -> URL {
        if let configured = env["API_BASE_URL"]?.trimmingCharacters(in: .whitespacesAndNewlines),
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

private enum GoogleOAuthSessionError: Error {
    case invalidConfiguration
    case invalidAuthorizationURL
    case missingCallbackData
    case missingIDToken
    case invalidState
    case providerError(String)
    case cancelled
}

private enum GoogleOAuthSession {
    static func startSignIn(config: OAuthConfig) async throws -> String {
        guard config.googleEnabled, let callbackScheme = config.callbackScheme else {
            throw GoogleOAuthSessionError.invalidConfiguration
        }

        let state = randomToken(length: 32)
        
        // Bridge through a frontend page that runs Google Identity Services
        // and returns a web-style id_token to the app callback URI.
        let bridgeURL = config.apiBaseURL.appendingPathComponent("google-native-auth.html")
        guard var components = URLComponents(url: bridgeURL, resolvingAgainstBaseURL: false) else {
            throw GoogleOAuthSessionError.invalidAuthorizationURL
        }

        components.queryItems = [
            URLQueryItem(name: "client_id", value: config.googleClientId),
            URLQueryItem(name: "app_redirect_uri", value: config.googleRedirectURI),
            URLQueryItem(name: "state", value: state),
        ]

        guard let authURL = components.url else {
            throw GoogleOAuthSessionError.invalidAuthorizationURL
        }

        var session: ASWebAuthenticationSession?
        return try await withCheckedThrowingContinuation { continuation in
            session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: callbackScheme
            ) { callbackURL, error in
                if let error = error as? ASWebAuthenticationSessionError,
                   error.code == .canceledLogin {
                    continuation.resume(throwing: GoogleOAuthSessionError.cancelled)
                    return
                }

                guard let callbackURL else {
                    continuation.resume(throwing: GoogleOAuthSessionError.missingCallbackData)
                    return
                }

                let values = parseOAuthValues(from: callbackURL)

                guard values["state"] == state else {
                    continuation.resume(throwing: GoogleOAuthSessionError.invalidState)
                    return
                }

                if let providerError = values["error"], !providerError.isEmpty {
                    continuation.resume(throwing: GoogleOAuthSessionError.providerError(providerError))
                    return
                }

                guard let idToken = values["id_token"], !idToken.isEmpty else {
                    continuation.resume(throwing: GoogleOAuthSessionError.missingIDToken)
                    return
                }
                continuation.resume(returning: idToken)
            }

            session?.prefersEphemeralWebBrowserSession = true
            session?.presentationContextProvider = OAuthPresentationAnchorProvider.shared
            _ = session?.start()
        }
    }

    private static func parseOAuthValues(from callbackURL: URL) -> [String: String] {
        var values: [String: String] = [:]

        if let queryItems = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?.queryItems {
            for item in queryItems {
                if let value = item.value {
                    values[item.name] = value
                }
            }
        }

        if let fragment = callbackURL.fragment,
           let fragmentItems = URLComponents(string: "https://callback.local/?\(fragment)")?.queryItems {
            for item in fragmentItems {
                if let value = item.value {
                    values[item.name] = value
                }
            }
        }

        return values
    }

    private static func randomToken(length: Int) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        result.reserveCapacity(length)
        for _ in 0..<length {
            result.append(charset.randomElement() ?? "a")
        }
        return result
    }
}

private final class OAuthPresentationAnchorProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = OAuthPresentationAnchorProvider()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        #if os(iOS)
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        #elseif os(macOS)
        return NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first ?? ASPresentationAnchor()
        #else
        return ASPresentationAnchor()
        #endif
    }
}
