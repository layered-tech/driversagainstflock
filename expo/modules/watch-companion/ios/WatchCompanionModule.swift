import ExpoModulesCore
import UIKit
import WatchConnectivity

public final class WatchCompanionModule: Module {
    public func definition() -> ModuleDefinition {
        Name("WatchCompanion")
        Events("onStateRequested", "onAreaOpened")

        OnCreate {
            DispatchQueue.main.async {
                let bridge = WatchPhoneBridge.shared
                bridge.requestState = { [weak self] in self?.sendEvent("onStateRequested", [:]) }
                bridge.areaOpened = { [weak self] id in self?.sendEvent("onAreaOpened", ["areaId": id]) }
                bridge.activate()
            }
        }
        OnDestroy {
            DispatchQueue.main.async {
                WatchPhoneBridge.shared.requestState = nil
                WatchPhoneBridge.shared.areaOpened = nil
            }
        }
        AsyncFunction("hasConnectedWatch") { () -> Bool in
            WatchPhoneBridge.shared.reachable
        }.runOnQueue(.main)
        AsyncFunction("pendingAreaReads") { () -> [Int] in
            WatchPhoneBridge.shared.pendingReads
        }.runOnQueue(.main)
        AsyncFunction("confirmAreaRead") { (areaId: Int) in
            WatchPhoneBridge.shared.confirmRead(areaId)
        }.runOnQueue(.main)
        AsyncFunction("publishSnapshot") { (payload: String) in
            try WatchPhoneBridge.shared.publish(payload)
        }.runOnQueue(.main)
        AsyncFunction("sendHapticCue") { (payload: String, promise: Promise) in
            WatchPhoneBridge.shared.sendCue(payload, promise: promise)
        }.runOnQueue(.main)
        AsyncFunction("openHapticsOnWatch") { (promise: Promise) in
            WatchPhoneBridge.shared.send(["path": "/daf/watch/open-haptics"], promise: promise)
        }.runOnQueue(.main)
    }
}

public final class WatchCompanionAppDelegateSubscriber: ExpoAppDelegateSubscriber {
    public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        WatchPhoneBridge.shared.activate()
        return true
    }
}

private enum WatchBridgeError: Error { case invalidPayload }

final class WatchPhoneBridge: NSObject, WCSessionDelegate {
    static let shared = WatchPhoneBridge()
    var requestState: (() -> Void)?
    var areaOpened: ((Int) -> Void)?
    private let defaults = UserDefaults.standard
    private var session: WCSession? { WCSession.isSupported() ? WCSession.default : nil }
    private var observing = false
    private var opening = false
    private var observer: NSObjectProtocol?
    private let snapshotKey = "daf.watch.snapshot"
    private let readsKey = "daf.watch.pendingAreaReads"
    private let openKey = "daf.watch.pendingOpen"

    var reachable: Bool {
        guard let session else { return false }
        return session.activationState == .activated && session.isPaired && session.isWatchAppInstalled && session.isReachable
    }
    var pendingReads: [Int] { (defaults.array(forKey: readsKey) as? [Int] ?? []).filter { $0 > 0 } }

    func activate() {
        guard let session else { return }
        if !observing {
            observing = true
            session.delegate = self
            observer = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
                self?.openPending()
                self?.requestState?()
            }
        }
        if session.activationState == .notActivated { session.activate() }
    }
    func confirmRead(_ id: Int) { defaults.set(pendingReads.filter { $0 != id }, forKey: readsKey) }

    func publish(_ payload: String) throws {
        guard let data = payload.data(using: .utf8), data.count <= 65_536,
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              json["protocolVersion"] as? Int == 1 else { throw WatchBridgeError.invalidPayload }
        defaults.set(payload, forKey: snapshotKey)
        activate()
        guard let session, session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        // Application context is a replaceable latest snapshot; never enqueue navigation history.
        try session.updateApplicationContext(["snapshot": payload])
        if session.isReachable {
            session.sendMessage(["path": "/daf/watch/state", "snapshot": payload], replyHandler: nil, errorHandler: nil)
        }
    }
    func sendCue(_ payload: String, promise: Promise) {
        guard let data = payload.data(using: .utf8), data.count <= 2_048,
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              json["version"] as? Int == 1,
              let pattern = json["pattern"] as? String, ["left", "right", "neutral", "camera"].contains(pattern),
              let issued = json["issuedAt"] as? Double, let expires = json["expiresAt"] as? Double,
              issued > 0, expires > issued, expires - issued <= 5_000 else {
            promise.reject("INVALID_CUE", "Invalid watch cue")
            return
        }
        guard Date().timeIntervalSince1970 * 1_000 < expires else { promise.resolve(nil); return }
        // Background snapshots are still useful; an unreachable watch must never receive a delayed turn cue.
        guard reachable else { promise.resolve(nil); return }
        send(["path": "/daf/watch/haptic-cue", "payload": payload], promise: promise)
    }
    func send(_ message: [String: Any], promise: Promise) {
        guard reachable, let session else {
            promise.reject("NO_WATCH", "Open DAF on your Apple Watch and try again.")
            return
        }
        session.sendMessage(message, replyHandler: { _ in promise.resolve(nil) }, errorHandler: { _ in
            promise.reject("WATCH_DELIVERY_FAILED", "Watch message could not be delivered.")
        })
    }
    private func receive(_ message: [String: Any], reply: (([String: Any]) -> Void)? = nil) {
        switch message["path"] as? String {
        case "/daf/watch/request":
            var response: [String: Any] = ["token": message["token"] as? String ?? ""]
            response["snapshot"] = defaults.string(forKey: snapshotKey)
            reply?(response)
            requestState?()
        case "/daf/watch/area-opened":
            if let id = message["areaId"] as? Int, id > 0 {
                var reads = pendingReads
                if !reads.contains(id) { reads.append(id) }
                defaults.set(Array(reads.suffix(100)), forKey: readsKey)
                areaOpened?(id)
            }
            reply?(["received": true])
        case "/daf/watch/open":
            guard let id = message["requestId"] as? String, (1...80).contains(id.count),
                  let url = handoffURL(message) else { reply?(["status": "invalid"]); return }
            let request: [String: Any] = ["requestId": id, "url": url.absoluteString, "createdAt": Date().timeIntervalSince1970]
            defaults.set(request, forKey: openKey)
            reply?(["requestId": id, "status": "queued"])
            openPending()
        default: reply?(["status": "invalid"])
        }
    }
    private func handoffURL(_ message: [String: Any]) -> URL? {
        switch message["target"] as? String {
        case "areas": return URL(string: "driversagainstflock:///areas")
        case "area-change":
            guard let area = message["areaId"] as? Int, let change = message["changeId"] as? Int,
                  area > 0, change > 0 else { return nil }
            return URL(string: "driversagainstflock:///areas/\(area)/change?changeId=\(change)")
        case "scorecard":
            guard let id = message["driveId"] as? String,
                  id.range(of: "^[A-Za-z0-9_-]{1,80}$", options: .regularExpression) != nil else { return nil }
            return URL(string: "driversagainstflock:///scorecard/drive/\(id)")
        default: return nil
        }
    }
    private func openPending() {
        guard !opening, UIApplication.shared.applicationState == .active,
              let request = defaults.dictionary(forKey: openKey),
              let id = request["requestId"] as? String,
              let rawURL = request["url"] as? String, let url = URL(string: rawURL),
              let createdAt = request["createdAt"] as? Double else { return }
        guard Date().timeIntervalSince1970 - createdAt < 120 else { defaults.removeObject(forKey: openKey); return }
        opening = true
        UIApplication.shared.open(url, options: [:]) { [weak self] success in
            DispatchQueue.main.async {
                guard let self else { return }
                self.opening = false
                if self.defaults.dictionary(forKey: self.openKey)?["requestId"] as? String == id {
                    self.defaults.removeObject(forKey: self.openKey)
                }
                if self.reachable {
                    self.session?.sendMessage(["path": "/daf/watch/open-ack", "requestId": id,
                                               "status": success ? "opened" : "failed"], replyHandler: nil, errorHandler: nil)
                }
            }
        }
    }
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            if activationState == .activated, let payload = self.defaults.string(forKey: self.snapshotKey) {
                try? self.publish(payload)
            }
            self.requestState?()
        }
    }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { if session.isReachable { self.requestState?() } }
    }
    func sessionWatchStateDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            if let payload = self.defaults.string(forKey: self.snapshotKey) { try? self.publish(payload) }
            self.requestState?()
        }
    }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async { self.receive(message) }
    }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        DispatchQueue.main.async { self.receive(message, reply: replyHandler) }
    }
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        DispatchQueue.main.async { self.receive(userInfo) }
    }
}
