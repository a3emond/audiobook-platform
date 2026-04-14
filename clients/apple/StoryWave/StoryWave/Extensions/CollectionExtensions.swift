// MARK: - Collection Safe Subscript

extension Array {
    /// Returns the element at `index` or `nil` if the index is out of bounds.
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
