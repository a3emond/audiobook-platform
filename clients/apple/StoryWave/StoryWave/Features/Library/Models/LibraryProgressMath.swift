import Foundation
import CoreGraphics
import AudiobookCore

/*
 Purpose:
 Centralized progress math for Library surfaces (rails, continue listening, summaries).

 Why this exists:
 Multiple views previously had duplicated rules for duration normalization and started-book
 fallback behavior. Keeping this in one place prevents subtle UI drift between cards.
*/
enum LibraryProgressMath {
    static let startedFallbackPercent: Double = 0.01

    enum ZeroDurationBehavior {
        case zero
        case nilValue
        case startedFallback
    }

    static func normalizedDurationSeconds(_ rawValue: Int?) -> Int? {
        guard let rawValue, rawValue > 0 else { return nil }

        // Server payloads can occasionally return millisecond-scale values.
        if rawValue > 200_000 {
            return max(1, rawValue / 1000)
        }

        return rawValue
    }

    static func progressPercent(
        progress: ProgressRecordDTO,
        bookDurationSeconds: Int?,
        zeroDurationBehavior: ZeroDurationBehavior
    ) -> Double? {
        if progress.completed {
            return 1
        }

        let progressDuration = normalizedDurationSeconds(progress.durationAtSave)
        let bookDuration = normalizedDurationSeconds(bookDurationSeconds)
        let duration = max(progressDuration ?? 0, bookDuration ?? 0)

        guard duration > 0 else {
            if progress.positionSeconds <= 0 {
                switch zeroDurationBehavior {
                case .zero:
                    return 0
                case .nilValue, .startedFallback:
                    return nil
                }
            }

            switch zeroDurationBehavior {
            case .zero:
                return 0
            case .nilValue:
                return nil
            case .startedFallback:
                return startedFallbackPercent
            }
        }

        let position = normalizedDurationSeconds(progress.positionSeconds) ?? 0
        return min(1, max(0, Double(position) / Double(duration)))
    }

    static func uiClampedProgress(_ progressPercent: Double) -> CGFloat {
        let raw = min(1, max(0, progressPercent))
        if raw <= 0 {
            return 0
        }
        if raw >= 1 {
            return 1
        }
        return CGFloat(max(0.01, min(0.99, raw)))
    }
}
