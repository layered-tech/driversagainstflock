import SwiftUI
import UserNotifications
import WatchKit

final class WatchAppDelegate: NSObject, WKApplicationDelegate, UNUserNotificationCenterDelegate {
    func applicationDidFinishLaunching() {
        _ = WatchRepository.shared
        UNUserNotificationCenter.current().delegate = self
    }
    func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
        WatchRepository.shared.handle(backgroundTasks)
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        DispatchQueue.main.async {
            WatchRepository.shared.page = 0
            completionHandler()
        }
    }
}

@main
struct DriversAgainstFlockApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) var delegate
    @StateObject private var repository = WatchRepository.shared

    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .environmentObject(repository)
                .tint(WatchDesign.brand)
                .preferredColorScheme(.dark)
                .onOpenURL { url in
                    guard url.scheme == "daf-watch" else { return }
                    repository.page = ["scorecard": 1, "diagnostics": 2, "haptics": 3][url.host ?? ""] ?? 0
                }
        }
    }
}
