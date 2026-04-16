#if os(iOS)
import SwiftUI
import UIKit

/*
 Purpose:
 iOS platform adapter view that forces the root UIKit hierarchy into edge-to-edge layout.

 Why this belongs here:
 This is platform/window behavior, not app orchestration logic.
*/
struct EdgeToEdgeRootForcer: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        Controller()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}

    private final class Controller: UIViewController {
        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            applyEdgeToEdgeIfPossible()
        }

        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            applyEdgeToEdgeIfPossible()
        }

        private func applyEdgeToEdgeIfPossible() {
            guard let window = view.window else { return }

            window.insetsLayoutMarginsFromSafeArea = false
            window.layoutMargins = .zero

            if let root = window.rootViewController {
                applyEdgeToEdge(to: root)
            }
        }

        private func applyEdgeToEdge(to controller: UIViewController) {
            controller.additionalSafeAreaInsets = .zero
            controller.edgesForExtendedLayout = [.top, .bottom, .left, .right]
            controller.extendedLayoutIncludesOpaqueBars = true
            controller.view.insetsLayoutMarginsFromSafeArea = false
            controller.viewRespectsSystemMinimumLayoutMargins = false

            for child in controller.children {
                applyEdgeToEdge(to: child)
            }

            if let presented = controller.presentedViewController {
                applyEdgeToEdge(to: presented)
            }
        }
    }
}
#endif
