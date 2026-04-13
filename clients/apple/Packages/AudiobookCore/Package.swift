// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AudiobookCore",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "AudiobookCore",
            targets: ["AudiobookCore"]
        )
    ],
    targets: [
        .target(
            name: "AudiobookCore",
            path: "Sources"
        )
    ]
)
