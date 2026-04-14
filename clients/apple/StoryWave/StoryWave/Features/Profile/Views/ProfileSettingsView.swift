import SwiftUI

struct ProfileSettingsView: View {
    @ObservedObject var viewModel: ProfileSettingsViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Playback prefs
                playbackSection

                // Library prefs
                librarySection

                // Security
                passwordSection
                emailSection

                if viewModel.isLoading { ProgressView() }

                if let success = viewModel.successMessage {
                    Text(success).foregroundStyle(.green).font(.footnote)
                }
                if let error = viewModel.errorMessage {
                    Text(error).foregroundStyle(.red).font(.footnote)
                }
            }
            .padding(16)
        }
        .task { await viewModel.loadSettings() }
    }

    // MARK: - Playback

    private var playbackSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Playback Preferences").font(.headline)

            Picker("Language", selection: $viewModel.selectedLocale) {
                Text("English").tag("en")
                Text("Français").tag("fr")
            }
            .pickerStyle(.segmented)

            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Skip forward").font(.caption).foregroundStyle(.secondary)
                    Picker("", selection: $viewModel.forwardJumpSeconds) {
                        ForEach(ProfileSettingsViewModel.jumpOptions, id: \.seconds) { opt in
                            Text(opt.label).tag(String(opt.seconds))
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Skip backward").font(.caption).foregroundStyle(.secondary)
                    Picker("", selection: $viewModel.backwardJumpSeconds) {
                        ForEach(ProfileSettingsViewModel.jumpOptions, id: \.seconds) { opt in
                            Text(opt.label).tag(String(opt.seconds))
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Playback speed").font(.caption).foregroundStyle(.secondary)
                TextField("1.0", text: $viewModel.playbackRate)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 100)
                Text("Range: 0.5 – 3.0").font(.caption2).foregroundStyle(.tertiary)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Default sleep timer").font(.caption).foregroundStyle(.secondary)
                Picker("", selection: $viewModel.sleepTimerMode) {
                    ForEach(ProfileSettingsViewModel.sleepModes, id: \.value) { mode in
                        Text(mode.label).tag(mode.value)
                    }
                }
                .pickerStyle(.segmented)
            }

            Divider()

            Toggle("Resume rewind", isOn: $viewModel.resumeRewindEnabled)
            if viewModel.resumeRewindEnabled {
                VStack(alignment: .leading, spacing: 8) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Rewind after idle threshold").font(.caption).foregroundStyle(.secondary)
                        Picker("", selection: $viewModel.rewindThresholdIndex) {
                            ForEach(ProfileSettingsViewModel.thresholdOptions.indices, id: \.self) { i in
                                Text(ProfileSettingsViewModel.thresholdOptions[i].label).tag(i)
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Rewind amount").font(.caption).foregroundStyle(.secondary)
                        Picker("", selection: $viewModel.rewindSecondsIndex) {
                            ForEach(ProfileSettingsViewModel.jumpOptions.indices, id: \.self) { i in
                                Text(ProfileSettingsViewModel.jumpOptions[i].label).tag(i)
                            }
                        }
                    }
                }
                .padding(.leading, 8)
            }

            Button("Save Settings") {
                Task { await viewModel.saveSettings() }
            }
            .buttonStyle(.borderedProminent)
            .tint(Branding.accent)
        }
        .padding(14)
        .background(Branding.surface)
        .cornerRadius(12)
    }

    // MARK: - Library

    private var librarySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Library").font(.headline)
            Toggle("Show completed books", isOn: $viewModel.showCompleted)
        }
        .padding(14)
        .background(Branding.surface)
        .cornerRadius(12)
    }

    // MARK: - Security

    private var passwordSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Change Password").font(.headline)
            SecureField("Current password", text: $viewModel.currentPasswordForPasswordChange)
                .textFieldStyle(RoundedBorderTextFieldStyle())
            SecureField("New password", text: $viewModel.newPassword)
                .textFieldStyle(RoundedBorderTextFieldStyle())
            Button("Update Password") {
                Task { await viewModel.changePassword() }
            }
            .buttonStyle(.bordered)
        }
        .padding(14)
        .background(Branding.surface)
        .cornerRadius(12)
    }

    private var emailSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Change Email").font(.headline)
            SecureField("Current password", text: $viewModel.currentPasswordForEmailChange)
                .textFieldStyle(RoundedBorderTextFieldStyle())
            emailField
            Button("Update Email") {
                Task { await viewModel.changeEmail() }
            }
            .buttonStyle(.bordered)
        }
        .padding(14)
        .background(Branding.surface)
        .cornerRadius(12)
    }

    @ViewBuilder
    private var emailField: some View {
        #if os(iOS)
        TextField("New email", text: $viewModel.newEmail)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled(true)
            .textFieldStyle(RoundedBorderTextFieldStyle())
        #else
        TextField("New email", text: $viewModel.newEmail)
            .textFieldStyle(RoundedBorderTextFieldStyle())
        #endif
    }
}
