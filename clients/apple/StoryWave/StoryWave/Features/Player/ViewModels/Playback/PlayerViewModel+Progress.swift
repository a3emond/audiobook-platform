import Foundation
import AudiobookCore

// MARK: - Progress Mode

extension PlayerViewModel {

    func setProgressMode(_ mode: PlayerProgressMode) {
        state.progressMode = mode
    }

    // MARK: Slider API

    func onProgressSliderChanged(_ sliderValue: Double) {
        updatePosition(resolveProgressInputTarget(from: sliderValue))
    }

    func progressRangeMin() -> Double { 0 }

    func progressRangeMax() -> Double {
        switch state.progressMode {
        case .book:
            return max(1, state.durationSeconds)
        case .chapter:
            guard let chapter = activeChapter() else { return max(1, state.durationSeconds) }
            return max(1, floor(chapterDurationSeconds(chapter)))
        }
    }

    func progressSliderValue() -> Double {
        switch state.progressMode {
        case .book:
            return min(max(0, state.positionSeconds), progressRangeMax())
        case .chapter:
            guard let chapter = activeChapter() else {
                return min(max(0, state.positionSeconds), progressRangeMax())
            }
            let offset = state.positionSeconds - chapterStartSeconds(chapter)
            return min(max(0, offset), progressRangeMax())
        }
    }

    func progressLeadingLabel()  -> String { formatClock(progressSliderValue()) }
    func progressTrailingLabel() -> String {
        switch state.progressMode {
        case .book:    return formatClock(state.durationSeconds)
        case .chapter: return formatClock(progressRangeMax())
        }
    }

    // MARK: Chapter Navigation

    func goToPreviousChapter() {
        let current = activeChapterIndexByTime()
        if current <= 0 { updatePosition(0); return }

        let currentStart = chapterStartSeconds(state.chapters[current])
        if state.positionSeconds - currentStart > 3 { updatePosition(currentStart); return }

        updatePosition(chapterStartSeconds(state.chapters[max(0, current - 1)]))
    }

    func goToNextChapter() {
        let current = activeChapterIndexByTime()
        guard current < state.chapters.count - 1 else { return }
        updatePosition(chapterStartSeconds(state.chapters[current + 1]))
    }

    func canGoToPreviousChapter() -> Bool { activeChapterIndexByTime() > 0 || state.positionSeconds > 0 }
    func canGoToNextChapter()     -> Bool { activeChapterIndexByTime() < state.chapters.count - 1 }

    func selectChapter(_ index: Int) {
        guard let chapter = state.chapters.first(where: { $0.index == index })
                         ?? state.chapters.dropFirst(index).first else { return }
        updatePosition(chapterStartSeconds(chapter))
    }

    // MARK: Chapter Geometry

    /// Returns the index of the chapter that contains `positionSeconds`.
    func chapterIndex(for positionSeconds: Double) -> Int {
        guard !state.chapters.isEmpty else { return 0 }

        if let match = state.chapters.lastIndex(where: { chapter in
            let start  = chapterStartSeconds(chapter)
            let end    = chapterEndSeconds(chapter)
            let isLast = chapter.index == state.chapters.count - 1
            return positionSeconds >= start && (isLast ? positionSeconds <= end : positionSeconds < end)
        }) {
            return match
        }

        if let last = state.chapters.last, positionSeconds >= chapterStartSeconds(last) {
            return state.chapters.count - 1
        }
        return 0
    }

    func activeChapter() -> PlayerChapterDTO? {
        state.chapters[safe: state.currentChapterIndex]
    }

    func chapterStartSeconds(_ chapter: PlayerChapterDTO) -> Double {
        chapterTimestampsUseMilliseconds() ? Double(chapter.start) / 1000.0 : Double(chapter.start)
    }

    func chapterEndSeconds(_ chapter: PlayerChapterDTO) -> Double {
        chapterTimestampsUseMilliseconds() ? Double(chapter.end) / 1000.0 : Double(chapter.end)
    }

    // MARK: Private Helpers

    private func activeChapterIndexByTime() -> Int {
        chapterIndex(for: state.positionSeconds)
    }

    private func resolveProgressInputTarget(from sliderValue: Double) -> Double {
        switch state.progressMode {
        case .book: return sliderValue
        case .chapter:
            guard let chapter = activeChapter() else { return sliderValue }
            let start = chapterStartSeconds(chapter)
            let end   = chapterEndSeconds(chapter)
            return max(start, min(start + sliderValue, max(start, end - 0.25)))
        }
    }

    private func chapterDurationSeconds(_ chapter: PlayerChapterDTO) -> Double {
        max(1, chapterEndSeconds(chapter) - chapterStartSeconds(chapter))
    }

    private func chapterTimestampsUseMilliseconds() -> Bool {
        if state.chapters.contains(where: { $0.start > 200_000 || $0.end > 200_000 }) { return true }
        let largestSpan = state.chapters.map { max(0, $0.end - $0.start) }.max() ?? 0
        return largestSpan > 5_000
    }

    private func formatClock(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded(.down)))
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%d:%02d", m, s)
    }
}
