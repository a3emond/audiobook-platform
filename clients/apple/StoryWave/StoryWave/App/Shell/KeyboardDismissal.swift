import SwiftUI

/*
 Purpose:
 iOS-only keyboard dismissal helpers for shell-level views.

 Why:
 Prevents the software keyboard from trapping navigation controls by allowing
 a tap anywhere in the view hierarchy to resign first responder.
*/
#if os(iOS)
import UIKit

extension View {
    func dismissKeyboardOnTap() -> some View {
        simultaneousGesture(
            TapGesture().onEnded {
                UIApplication.shared.sendAction(
                    #selector(UIResponder.resignFirstResponder),
                    to: nil,
                    from: nil,
                    for: nil
                )
            }
        )
    }
}
#else
extension View {
    func dismissKeyboardOnTap() -> some View {
        self
    }
}
#endif
