import SwiftUI
import AudiobookCore

struct DiscussionView: View {
    @ObservedObject var viewModel: DiscussionViewModel
    let isAdmin: Bool
    @FocusState private var composerFocused: Bool
    @State private var highlightedMessageId: String?

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
                    HStack(spacing: 0) {
                        channelsPanel
                        Divider()
                        messagesPanel
                    }
                }
            }
            .navigationTitle("Discussions")
        }
        .task {
            await viewModel.loadChannels()
            #if os(macOS)
            composerFocused = true
            #endif
        }
        .onChange(of: viewModel.state.selectedChannelId) { _, _ in
            #if os(macOS)
            DispatchQueue.main.async {
                composerFocused = true
            }
            #endif
        }
    }

    private var channelsPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(viewModel.state.channels) { channel in
                        HStack(spacing: 8) {
                            Button {
                                Task { await viewModel.selectChannel(channel.id) }
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(channel.displayName)
                                        .font(.caption.weight(.semibold))
                                    Text(channel.description)
                                        .font(.caption2)
                                        .foregroundStyle(Branding.textMuted)
                                        .lineLimit(2)
                                }
                                .padding(8)
                                .frame(maxWidth: .infinity, alignment: .leading)
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

                            if isAdmin && viewModel.canDeleteChannel(channel) {
                                Button("Del") {
                                    Task { await viewModel.deleteChannel(channel) }
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                            }
                        }
                    }
                }
            }

            if isAdmin {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Admin channel controls")
                        .font(.caption.weight(.semibold))
                    TextField("New category title", text: $viewModel.newChannelTitle)
                        .textFieldStyle(.roundedBorder)
                    TextField("Short description", text: $viewModel.newChannelDescription)
                        .textFieldStyle(.roundedBorder)
                    TextField("Optional key (slug)", text: $viewModel.newChannelKey)
                        .textFieldStyle(.roundedBorder)
                    Button("Add category") {
                        Task { await viewModel.createChannel() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Branding.accent)
                    .disabled(viewModel.newChannelTitle.trimmingCharacters(in: .whitespaces).isEmpty ||
                              viewModel.newChannelDescription.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(.top, 4)
            }
        }
        .padding(12)
        .frame(width: 280)
        .background(Branding.surface)
    }

    private var messagesPanel: some View {
        VStack(spacing: 0) {
            if viewModel.state.isLoadingMessages {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 10) {
                            if viewModel.state.hasMoreMessages {
                                Button(viewModel.state.isLoadingOlderMessages ? "Loading..." : "Load older messages") {
                                    Task { await viewModel.loadOlderMessages() }
                                }
                                .buttonStyle(.bordered)
                                .disabled(viewModel.state.isLoadingOlderMessages)
                            }

                            ForEach(viewModel.state.messages) { msg in
                                VStack(alignment: .leading, spacing: 6) {
                                    if let replyId = msg.replyToMessageId,
                                       let preview = viewModel.messagePreview(id: replyId) {
                                        HStack(spacing: 6) {
                                            Text("Replying to")
                                                .font(.caption)
                                                .foregroundStyle(Branding.textMuted)
                                            Text("\"\(preview)\"")
                                                .font(.caption)
                                                .foregroundStyle(Branding.textMuted)
                                                .lineLimit(1)
                                            if viewModel.state.messages.contains(where: { $0.id == replyId }) {
                                                Button("Jump") {
                                                    withAnimation(.easeInOut(duration: 0.2)) {
                                                        proxy.scrollTo(replyId, anchor: .center)
                                                    }
                                                    highlightedMessageId = replyId
                                                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                                                        highlightedMessageId = nil
                                                    }
                                                }
                                                .buttonStyle(.borderless)
                                                .font(.caption2)
                                            }
                                        }
                                    }

                                    HStack {
                                        HStack(spacing: 6) {
                                            Text(msg.senderName ?? "Anonymous")
                                                .font(.caption.weight(.semibold))
                                            if msg.author.isAdmin {
                                                Text("Admin")
                                                    .font(.caption2.weight(.semibold))
                                                    .padding(.horizontal, 6)
                                                    .padding(.vertical, 2)
                                                    .background(Branding.accent.opacity(0.2))
                                                    .cornerRadius(4)
                                            }
                                        }
                                        Spacer()
                                        Text(formatTimestamp(msg.createdAt ?? ""))
                                            .font(.caption2)
                                            .foregroundStyle(Branding.textMuted)
                                        Button("Reply") {
                                            viewModel.startReply(messageId: msg.id)
                                            composerFocused = true
                                        }
                                        .buttonStyle(.borderless)
                                        .font(.caption)
                                        if isAdmin {
                                            Button("Delete") {
                                                if let channelId = viewModel.state.selectedChannelId {
                                                    Task { await viewModel.deleteMessage(messageId: msg.id, channelId: channelId) }
                                                }
                                            }
                                            .buttonStyle(.borderless)
                                            .font(.caption)
                                        }
                                    }

                                    Text(msg.text)
                                        .font(.body)
                                        .lineLimit(nil)
                                }
                                .padding(10)
                                .background(
                                    highlightedMessageId == msg.id
                                        ? Branding.accent.opacity(0.2)
                                        : Branding.surface
                                )
                                .cornerRadius(8)
                                .id(msg.id)
                            }

                            if viewModel.state.messages.isEmpty {
                                Text("No messages yet. Start the conversation!")
                                    .foregroundStyle(Branding.textMuted)
                            }
                        }
                        .padding(12)
                    }
                    .onChange(of: viewModel.state.messages.count) { _, _ in
                        if let lastId = viewModel.state.messages.last?.id {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                proxy.scrollTo(lastId, anchor: .bottom)
                            }
                        }
                    }
                }
            }

            Divider()

            VStack(spacing: 8) {
                if let replyTarget = viewModel.replyTarget() {
                    HStack(spacing: 6) {
                        Text("Replying to")
                            .font(.caption)
                            .foregroundStyle(Branding.textMuted)
                        Text(replyTarget.author.displayName)
                            .font(.caption.weight(.semibold))
                        Text("\"\(viewModel.messagePreview(id: replyTarget.id) ?? "")\"")
                            .font(.caption)
                            .foregroundStyle(Branding.textMuted)
                            .lineLimit(1)
                        Spacer()
                        Button("Cancel") {
                            viewModel.cancelReply()
                        }
                        .buttonStyle(.borderless)
                        .font(.caption)
                    }
                }

                HStack(spacing: 8) {
                    TextField("Message...", text: $viewModel.messageInput)
                        .textFieldStyle(.roundedBorder)
                        .focused($composerFocused)
                        .onSubmit {
                            sendCurrentMessage()
                        }

                    Button("Send") {
                        sendCurrentMessage()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Branding.accent)
                    .disabled(viewModel.messageInput.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .padding(12)

            if let status = viewModel.statusMessage {
                Text(status)
                    .font(.caption)
                    .foregroundStyle(Branding.textMuted)
                    .padding(.bottom, 8)
            }
        }
    }

    private func sendCurrentMessage() {
        guard let channelId = viewModel.state.selectedChannelId else { return }
        Task {
            await viewModel.sendMessage(
                channelId: channelId,
                text: viewModel.messageInput
            )
            #if os(macOS)
            await MainActor.run {
                composerFocused = true
            }
            #endif
        }
    }

    init(viewModel: DiscussionViewModel, isAdmin: Bool) {
        self.viewModel = viewModel
        self.isAdmin = isAdmin
    }

    private func formatTimestamp(_ timestamp: String) -> String {
        let formatter = ISO8601DateFormatter()

        if let date = formatter.date(from: timestamp) {
            let timeFormatter = DateFormatter()
            timeFormatter.timeStyle = .short
            return timeFormatter.string(from: date)
        }

        return timestamp.prefix(10).description
    }
}
