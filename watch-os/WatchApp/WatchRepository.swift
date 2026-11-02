import Combine
import Foundation
import UserNotifications
import WatchConnectivity
import WatchKit
import WidgetKit

final class WatchRepository: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchRepository()
    @Published private(set) var snapshot: WatchSnapshot?
    @Published private(set) var connected = false
    @Published private(set) var connectionChecked = false
    @Published private(set) var incompatible = false
    @Published private(set) var remoteProtocolVersion: Int?
    @Published private(set) var received = 0
    @Published private(set) var dropped = 0
    @Published private(set) var lastError = "none"
    @Published private(set) var history: [String] = []
    @Published private(set) var pingStatus = "Not measured"
    @Published private(set) var hapticStatus = "System haptic settings apply"
    @Published private(set) var handoffStatus = "idle"
    @Published private(set) var endedAt: Double?
    @Published private(set) var endedByArrival = false
    @Published private(set) var dismissedCameraId: String?
    @Published private(set) var recentCameraAlert: CameraAlert?
    @Published private(set) var cameraEndedAt: Double?
    @Published var page = 0

    private let session = WCSession.default
    private let defaults = UserDefaults.standard
    private let haptics = WatchHaptics()
    private var gate = SnapshotGate()
    private var pendingCues: [WatchCue] = []
    private var lastCueIds: [String] = []
    private var lastCameraKey: String?
    private var lastNotificationKey: String?
    private var handoffId: String?
    private var lastRefresh: Double = 0
    private var lastWidgetRefresh: Double = 0
    private var widgetState = ""
    private var backgroundTasks: Set<WKRefreshBackgroundTask> = []
    private var contentObserver: NSKeyValueObservation?
    private var lastManeuverAt: Double = 0

    private override init() {
        super.init()
        lastCueIds = defaults.stringArray(forKey: "cueIds") ?? []
        lastCameraKey = defaults.string(forKey: "cameraCueKey")
        lastNotificationKey = defaults.string(forKey: "cameraNotificationKey")
        if let payload = WatchCache.read(), let saved = try? WatchSnapshot.parse(payload) {
            _ = gate.accept(saved)
            snapshot = saved
            remoteProtocolVersion = saved.protocolVersion
        }
        session.delegate = self
        contentObserver = session.observe(\.hasContentPending, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.completeBackgroundTasks() }
        }
        session.activate()
    }

    private func record(_ value: String) { history = Array((history + [value]).suffix(20)) }
    private func fail(_ value: String) { lastError = value; record(value) }

    func accept(_ payload: String) {
        received += 1
        let next: WatchSnapshot
        do {
            next = try WatchSnapshot.parse(payload)
        } catch WatchPayloadError.incompatible(let version) {
            remoteProtocolVersion = version
            incompatible = true
            dropped += 1
            fail("Incompatible protocol")
            return
        } catch {
            dropped += 1
            fail("Invalid snapshot")
            return
        }
        guard gate.accept(next) else { dropped += 1; record("Older or duplicate revision"); return }
        let previous = snapshot
        if let alert = previous?.cameraAlert, next.cameraAlert == nil {
            recentCameraAlert = alert
            cameraEndedAt = WatchContract.now
        } else if next.cameraAlert?.id != previous?.cameraAlert?.id {
            recentCameraAlert = nil
            cameraEndedAt = nil
            dismissedCameraId = nil
        }
        if previous?.sessionId != nil && next.sessionId == nil {
            endedAt = WatchContract.now
            endedByArrival = previous?.navigation.maneuver?.kind == "arrive"
            page = 0
        } else if next.sessionId != nil {
            endedAt = nil
            if next.sessionId != previous?.sessionId { page = 0 }
        }
        snapshot = next
        incompatible = false
        remoteProtocolVersion = next.protocolVersion
        lastError = "none"
        do { try WatchCache.save(payload) } catch { fail("Shared watch cache unavailable") }
        playPendingCues()
        handleCamera(next)
        refreshWidgets(next)
        record("Accepted revision \(next.revision)")
    }

    private func refreshWidgets(_ next: WatchSnapshot) {
        let state = "\(next.sessionId ?? "idle"):\(next.navigation.status):\(next.areas?.unread ?? -1):\(next.currentPrivacyScore ?? -1)"
        let now = WatchContract.now
        if state != widgetState || now - lastWidgetRefresh >= 60_000 {
            widgetState = state
            lastWidgetRefresh = now
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    func acceptCue(_ payload: String) {
        guard let cue = try? WatchCue.parse(payload), !lastCueIds.contains(cue.id) else {
            dropped += 1
            return
        }
        pendingCues.removeAll { $0.id == cue.id }
        pendingCues.append(cue)
        pendingCues = Array(pendingCues.suffix(8))
        playPendingCues()
    }

    private func playPendingCues() {
        let now = WatchContract.now
        let candidates = pendingCues.sorted { $0.pattern != "camera" && $1.pattern == "camera" }
        pendingCues = []
        for cue in candidates {
            guard cue.expiresAt > now, !lastCueIds.contains(cue.id) else { dropped += 1; continue }
            guard cue.eligible(snapshot, at: now) else { pendingCues.append(cue); continue }
            if cue.pattern == "camera", cue.preview != true, snapshot?.cameraKey == lastCameraKey { continue }
            if cue.pattern == "camera", now - lastManeuverAt < 700 {
                pendingCues.append(cue)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { [weak self] in self?.playPendingCues() }
                continue
            }
            lastCueIds = Array((lastCueIds + [cue.id]).suffix(32))
            defaults.set(lastCueIds, forKey: "cueIds")
            if cue.pattern == "camera", cue.preview != true {
                lastCameraKey = snapshot?.cameraKey
                defaults.set(lastCameraKey, forKey: "cameraCueKey")
            }
            play(cue.pattern)
            if cue.pattern != "camera" { lastManeuverAt = now }
        }
    }

    private func play(_ pattern: String) {
        let suppressed = haptics.play(pattern)
        hapticStatus = suppressed ?? "Requested · system settings apply"
        record(suppressed.map { "Cue suppressed: \($0)" } ?? "Requested \(pattern) cue")
    }
    func preview(_ pattern: String) { play(pattern) }

    private func handleCamera(_ next: WatchSnapshot) {
        let center = UNUserNotificationCenter.current()
        guard let alert = next.cameraAlert else {
            center.removeDeliveredNotifications(withIdentifiers: ["daf-camera"])
            center.removePendingNotificationRequests(withIdentifiers: ["daf-camera"])
            return
        }
        let now = WatchContract.now
        guard next.cameraAlertsEnabled == true, !WatchContract.stale(alert.sourceAt, at: now) else { return }
        // Context replay restores visuals but must not replay an old alert on the wrist.
        guard let issuedAt = alert.issuedAt, now - issuedAt >= -5_000, now - issuedAt < 2_000 else { return }
        if next.cameraKey != lastCameraKey {
            if now - lastManeuverAt < 700 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { [weak self] in
                    guard let self, let latest = self.snapshot, latest.cameraKey == next.cameraKey else { return }
                    self.handleCamera(latest)
                }
                return
            }
            lastCameraKey = next.cameraKey
            defaults.set(lastCameraKey, forKey: "cameraCueKey")
            play("camera")
        }
        guard WKApplication.shared().applicationState == .background,
              next.cameraKey != lastNotificationKey else { return }
        lastNotificationKey = next.cameraKey
        defaults.set(lastNotificationKey, forKey: "cameraNotificationKey")
        let content = UNMutableNotificationContent()
        content.title = alert.count > 1 ? "\(alert.count) cameras ahead" : "Camera ahead"
        content.body = [alert.type, alert.road, WatchFormat.distance(alert.distanceMeters)].filter { !$0.isEmpty }.joined(separator: " · ")
        content.sound = .default
        content.userInfo = ["page": 0]
        center.add(UNNotificationRequest(identifier: "daf-camera", content: content, trigger: nil)) { [weak self] error in
            if error != nil { DispatchQueue.main.async { self?.fail("Camera notification unavailable") } }
        }
    }

    func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }
    func dismissCamera() {
        dismissedCameraId = snapshot?.cameraAlert?.id
        recentCameraAlert = snapshot?.cameraAlert
        cameraEndedAt = WatchContract.now
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ["daf-camera"])
    }

    func refresh(request: Bool = false) {
        connected = session.activationState == .activated && session.isReachable
        connectionChecked = session.activationState == .activated
        playPendingCues()
        let now = WatchContract.now
        guard request || now - lastRefresh >= 10_000 else { return }
        lastRefresh = now
        guard connected else { pingStatus = "Phone disconnected"; return }
        let start = ProcessInfo.processInfo.systemUptime
        let token = UUID().uuidString
        pingStatus = "Waiting…"
        session.sendMessage(["path": "/daf/watch/request", "token": token], replyHandler: { [weak self] reply in
            DispatchQueue.main.async {
                guard let self, reply["token"] as? String == token else { return }
                self.pingStatus = "\(Int((ProcessInfo.processInfo.systemUptime - start) * 1_000)) ms"
                if let payload = reply["snapshot"] as? String { self.accept(payload) }
            }
        }, errorHandler: { [weak self] _ in
            DispatchQueue.main.async { self?.pingStatus = "Timed out — retry"; self?.fail("Phone request failed") }
        })
    }

    func areaOpened(_ id: Int) {
        resetHandoff()
        guard id > 0 else { return }
        let message: [String: Any] = ["path": "/daf/watch/area-opened", "areaId": id]
        // Read acknowledgments may be queued; haptic cues and open requests never are.
        session.transferUserInfo(message)
        if session.isReachable { session.sendMessage(message, replyHandler: nil, errorHandler: nil) }
    }
    func resetHandoff() { handoffId = nil; handoffStatus = "idle" }
    func openOnPhone(_ target: String, areaId: Int? = nil, changeId: Int? = nil, driveId: String? = nil) {
        guard session.isReachable else { handoffStatus = "unavailable"; return }
        let id = UUID().uuidString
        handoffId = id
        handoffStatus = "sending"
        var request: [String: Any] = ["path": "/daf/watch/open", "requestId": id, "target": target]
        request["areaId"] = areaId
        request["changeId"] = changeId
        request["driveId"] = driveId
        session.sendMessage(request, replyHandler: { [weak self] reply in
            DispatchQueue.main.async { self?.acknowledge(reply) }
        }, errorHandler: { [weak self] _ in
            DispatchQueue.main.async { if self?.handoffId == id { self?.handoffStatus = "failed" } }
        })
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            if self?.handoffId == id, self?.handoffStatus == "sending" { self?.handoffStatus = "failed" }
        }
    }
    private func acknowledge(_ reply: [String: Any]) {
        guard let id = reply["requestId"] as? String, id == handoffId else { return }
        let status = reply["status"] as? String ?? "failed"
        handoffStatus = ["opened", "queued"].contains(status) ? status : "failed"
    }

    private func receive(_ message: [String: Any]) {
        switch message["path"] as? String {
        case "/daf/watch/haptic-cue":
            if let payload = message["payload"] as? String { acceptCue(payload) }
        case "/daf/watch/open-haptics": page = 3
        case "/daf/watch/open-ack": acknowledge(message)
        default:
            if let payload = message["snapshot"] as? String { accept(payload) }
        }
    }
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.connectionChecked = true
            if error != nil { self.fail("Watch connection unavailable") }
            self.receive(session.receivedApplicationContext)
            self.refresh(request: true)
            self.completeBackgroundTasks()
        }
    }
    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { self.refresh(request: true) }
    }
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        DispatchQueue.main.async { self.receive(applicationContext); self.completeBackgroundTasks() }
    }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async { self.receive(message); self.completeBackgroundTasks() }
    }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        DispatchQueue.main.async { self.receive(message); replyHandler(["received": true]); self.completeBackgroundTasks() }
    }
    func handle(_ tasks: Set<WKRefreshBackgroundTask>) {
        for task in tasks {
            if task is WKWatchConnectivityRefreshBackgroundTask {
                backgroundTasks.insert(task)
            } else if let snapshotTask = task as? WKSnapshotRefreshBackgroundTask {
                snapshotTask.setTaskCompleted(restoredDefaultState: true, estimatedSnapshotExpiration: .distantFuture, userInfo: nil)
            } else {
                task.setTaskCompletedWithSnapshot(false)
            }
        }
        completeBackgroundTasks()
    }
    private func completeBackgroundTasks() {
        guard session.activationState == .activated, !session.hasContentPending else { return }
        for task in backgroundTasks { task.setTaskCompletedWithSnapshot(false) }
        backgroundTasks.removeAll()
    }
}
