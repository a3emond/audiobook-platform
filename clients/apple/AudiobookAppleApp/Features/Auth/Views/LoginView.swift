import SwiftUI

struct LoginView: View {
    @ObservedObject var viewModel: AuthViewModel

    var body: some View {
        VStack(spacing: 16) {
            BrandLogoView(size: 84)
            Text("Sign In")
                .font(.title.weight(.semibold))
            Text("Welcome back to your library")
                .font(.subheadline)
                .foregroundStyle(Branding.textMuted)

            VStack(spacing: 12) {
                TextField("Email", text: Binding(
                    get: { viewModel.state.email },
                    set: { viewModel.updateEmail($0) }
                ))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .textFieldStyle(.roundedBorder)

                SecureField("Password", text: Binding(
                    get: { viewModel.state.password },
                    set: { viewModel.updatePassword($0) }
                ))
                .textFieldStyle(.roundedBorder)

                if let errorMessage = viewModel.state.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.footnote)
                }

                Button {
                    Task { await viewModel.login() }
                } label: {
                    if viewModel.state.isLoading {
                        ProgressView()
                    } else {
                        Text("Login")
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                .background(Branding.accent)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .disabled(viewModel.state.isLoading || viewModel.state.email.isEmpty || viewModel.state.password.isEmpty)
            }
            .brandCard()

            if viewModel.state.isAuthenticated {
                Text("Authenticated")
                    .foregroundStyle(.green)

                Button("Sign Out") {
                    viewModel.signOut()
                }
            }
        }
        .padding()
        .frame(maxWidth: 420)
    }
}
