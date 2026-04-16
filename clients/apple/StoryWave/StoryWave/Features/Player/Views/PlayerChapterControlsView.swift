import SwiftUI
import AudiobookCore

struct PlayerChapterControlsView: View {
    @ObservedObject var viewModel: PlayerViewModel

    var body: some View {
        HStack(spacing: 10) {
            chapterMenu
            sleepTimerMenu

            if let countdown = viewModel.state.sleepTimerCountdownText {
                Text(countdown)
                    .font(.caption.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(Color.orange.opacity(0.14))
                    .foregroundStyle(Color.orange)
                    .clipShape(Capsule())
            }
        }
    }

    private var chapterMenu: some View {
        Menu {
            ForEach(Array(viewModel.state.chapters.enumerated()), id: \.offset) { index, chapter in
                Button("\(chapter.index + 1). \(chapter.title)") {
                    viewModel.selectChapter(index)
                }
            }
        } label: {
            let chapter = viewModel.state.chapters[safe: viewModel.state.currentChapterIndex]
            HStack {
                Image(systemName: "list.bullet")
                    .foregroundStyle(Branding.accent)
                Text(chapter.map { "\($0.index + 1). \($0.title)" } ?? "Select Chapter")
                    .lineLimit(1)
                Spacer()
                Image(systemName: "chevron.down")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Branding.surface)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    private var sleepTimerMenu: some View {
        Menu {
            Section("Progress tracking") {
                Button {
                    viewModel.setProgressMode(.chapter)
                } label: {
                    Text("Track chapter progress\(viewModel.state.progressMode == .chapter ? " ✓" : "")")
                }

                Button {
                    viewModel.setProgressMode(.book)
                } label: {
                    Text("Track book progress\(viewModel.state.progressMode == .book ? " ✓" : "")")
                }
            }

            Section("Night auto pause: \(viewModel.sleepTimerLabel())") {
                Button {
                    viewModel.setSleepTimerMode(.off)
                } label: {
                    Text("Disabled\(viewModel.state.sleepTimerMode == .off ? " ✓" : "")")
                }

                Button {
                    viewModel.setSleepTimerMode(.fifteenMinutes)
                } label: {
                    Text("15 min\(viewModel.state.sleepTimerMode == .fifteenMinutes ? " ✓" : "")")
                }

                Button {
                    viewModel.setSleepTimerMode(.thirtyMinutes)
                } label: {
                    Text("30 min\(viewModel.state.sleepTimerMode == .thirtyMinutes ? " ✓" : "")")
                }

                Button {
                    viewModel.setSleepTimerMode(.fortyFiveMinutes)
                } label: {
                    Text("45 min\(viewModel.state.sleepTimerMode == .fortyFiveMinutes ? " ✓" : "")")
                }

                Button {
                    viewModel.setSleepTimerMode(.sixtyMinutes)
                } label: {
                    Text("1 h\(viewModel.state.sleepTimerMode == .sixtyMinutes ? " ✓" : "")")
                }

                Button {
                    viewModel.setSleepTimerMode(.chapter)
                } label: {
                    Text("End of current chapter\(viewModel.state.sleepTimerMode == .chapter ? " ✓" : "")")
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "moon.stars")
                    .font(.caption.bold())
                Text("Timer")
                    .font(.caption.bold())
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(viewModel.state.sleepTimerMode == .off ? Branding.surface : Color.orange.opacity(0.18))
            )
        }
    }
}