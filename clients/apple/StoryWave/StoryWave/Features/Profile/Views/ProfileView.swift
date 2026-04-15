import SwiftUI
import AudiobookCore

struct ProfileView: View {
    @ObservedObject var viewModel: ProfileViewModel
    @ObservedObject var statsViewModel: ProfileStatsViewModel
    @ObservedObject var settingsViewModel: ProfileSettingsViewModel
    let onSignOut: () async -> Void
    @State private var selectedTab: ProfileTab = .profile

    enum ProfileTab: String, CaseIterable, Identifiable {
        case profile = "Profile"
        case stats = "Stats"

        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Picker("", selection: $selectedTab) {
                    ForEach(ProfileTab.allCases) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .padding(.horizontal)

                if viewModel.isLoading {
                    ProgressView()
                        .frame(maxHeight: .infinity)
                } else if let errorMessage = viewModel.errorMessage {
                    VStack(spacing: 12) {
                        Text("Failed to load profile")
                            .font(.headline)
                        Text(errorMessage)
                            .font(.body)
                            .foregroundStyle(Branding.textMuted)
                        Button("Retry") {
                            Task { await viewModel.load() }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Branding.accent)
                    }
                    .padding()
                } else if let user = viewModel.user {
                    sectionView(user: user)
                } else {
                    Text("No profile data available.")
                        .foregroundStyle(Branding.textMuted)
                        .frame(maxHeight: .infinity)
                }
            }
            .navigationTitle("Profile")
        }
        .task {
            await viewModel.load()
        }
    }

    @ViewBuilder
    private func sectionView(user: UserProfileDTO) -> some View {
        switch selectedTab {
        case .profile:
            profileSection(user: user)
        case .stats:
            ProfileStatsView(viewModel: statsViewModel)
        }
    }

    private func profileSection(user: UserProfileDTO) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                VStack(spacing: 8) {
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 64))
                        .foregroundStyle(Branding.accent)
                    Text(user.displayName ?? "User")
                        .font(.title2.weight(.semibold))
                    Text(user.email)
                        .font(.body)
                        .foregroundStyle(Branding.textMuted)
                }
                .padding(20)
                .frame(maxWidth: .infinity)
                .background(Branding.surface)
                .cornerRadius(12)

                VStack(spacing: 12) {
                    InfoRow(label: "Email", value: user.email)
                    if let role = user.role {
                        InfoRow(label: "Role", value: role.capitalized)
                    }
                    if let createdAt = user.createdAt {
                        InfoRow(label: "Member Since", value: createdAt.prefix(10).description)
                    }
                }
                .padding(16)
                .background(Branding.surface)
                .cornerRadius(12)

                ProfileSettingsView(viewModel: settingsViewModel, isEmbedded: true)

                Button {
                    Task { await onSignOut() }
                } label: {
                    HStack {
                        Image(systemName: "arrow.left.circle")
                        Text("Sign Out")
                    }
                    .frame(maxWidth: .infinity)
                    .padding(12)
                    .background(Color.red.opacity(0.2))
                    .foregroundStyle(Color.red)
                    .cornerRadius(8)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 16)
        }
    }
}

struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .foregroundStyle(Branding.textMuted)
            Spacer()
            Text(value)
                .font(.body.weight(.semibold))
        }
    }
}
