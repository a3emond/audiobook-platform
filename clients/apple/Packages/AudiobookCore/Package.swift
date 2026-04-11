// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "AudiobookCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(name: "AudiobookCore", targets: ["AudiobookCore"])
    ],
    targets: [
        .target(
            name: "AudiobookCore",
            path: "Sources"
        ),
        .testTarget(
            name: "CoreNetworkingTests",
            dependencies: ["AudiobookCore"],
            path: "Tests/CoreNetworkingTests"
        )
    ]
)
