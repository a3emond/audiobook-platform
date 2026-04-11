import SwiftUI

struct DiscussionView: View {
    @ObservedObject var viewModel: DiscussionViewModel

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if viewModel.state.isLoading {
                    ProgressView()
                        .frame(maxHeight: .infinity)
                } else if let errorMessage = viewModel.state.errorMessage {
                    VStack(spacing: 12) {
                        Text(errorMessage)
                            .foregroundStyle(Branding.textMuted)
                        Button("Retry") {
                            Task { await viewModel.loadChannels() }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Branding.accent)
                    }
                    .padding()
                    .frame(maxHeight: .infinity)
                } else if viewModel.state.channels.isEmpty {
                    Text("No discussions available.")
                        .foregroundStyle(Branding.textMuted)
                        .frame(maxHeight: .infinity)
                } else {
                    VStack(spacing: 0) {
                        // Channel selector
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(viewModel.state.channels) { channel in
                                    Button {
                                        Task { await viewModel.selectChannel(channel.id) }
                                    } label: {
                                        VStack(spacing: 4) {
                                            Text(channel.displayName)
                                                .font(.caption.weight(.semibold))
                                            Text(channel.languageCode)
                                                .font(.caption2)
                                                .foregroundStyle(Branding.textMuted)
                                        }
                                        .padding(8)
                                        .background(
                                            viewModel.state.selectedChannelId == channel.id
                                                ? Branding.accent
                                                : Branding.surface
                                        )
                                        .foregroundStyle(
                                            viewModel.state.selectedChannelId == channel.id
                                                ? .black
                                                : Branding.text
                                        )
                                        .cornerRadius(8)
                                    }
                                }
                            }
                            .padding(12)
                        }
                        .background(Branding.surface)

                        Divider()

                        // Message list
                        if viewModel.state.isLoadingMessages {
                            ProgressView()
                                .frame(maxHeight: .infinity)
                        } else if viewModel.state.messages.isEmpty {
                            Text("No messages yet. Start the conversation!")
                                .foregroundStyle(Branding.textMuted)
                                .frame(maxHeight: .infinity)
                        } else {
                            ScrollViewReader { proxy in
                                ScrollView {
                                    VStack(alignment: .leading, spacing: 12) {
                                        ForEach(viewModel.state.messages) { msg in
                                            VStack(alignment: .leading, spacing: 4) {
                                                HStack {
                                                    Text(msg.senderName ?? "Anonymous")
                                                        .font(.caption.weight(.semibold))
                                                    Spacer()
                                                    Text(formatTimestamp(msg.createdAt))
                                                        .font(.caption2)
                                                        .foregroundStyle(Branding.textMuted)
                                                }
                                                Text(msg.text)
                                                    .font(.body)
                                                    .lineLimit(nil)
                                            }
                                            .padding(10)
                                            .background(Branding.surface)
                                            .cornerRadius(8)
                                            .id(msg.id)
                                        }
                                    }
                                    .padding(12)
                                    .onAppear {
                                        if let lastId = viewModel.state.messages.last?.id {
                                            proxy.scrollTo(lastId, anchor: .bottom)
                                        }
                                    }
                                }
                            }
                        }

                        Divider()

                        // Message composer
                        HStack(spacing: 8) {
                            TextField("Message...", text: $viewModel.state.messageInput)
                                .textFieldStyle(.roundedBorder)
                            Button {
                                if let channelId = viewModel.state.selectedChannelId {
                                    Task {
                                        await viewModel.sendMessage(
                                            channelId: channelId,
                                            text: viewModel.state.messageInput
                                        )
                                    }
                                }
                            } label: {
                                Image(systemName: "arrow.up.circle.fill")
                                    .font(.title3)
                            }
                            .foregroundStyle(Branding.accent)
                            .disabled(viewModel.state.messageInput.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                        .padding(12)
                    }
                }
            }
            .navigationTitle("Discussions")
        }
        .task {
            await viewModel.loadChannels()
        }
    }

    private func formatTimestamp(_ timestamp: String) -> String {
        // Simple format; in production use DateFormatter
        timestamp.prefix(10).description
    }
}
