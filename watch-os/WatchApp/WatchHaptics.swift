import Foundation
import WatchKit

struct WatchCue: Decodable {
    let version: Int
    let id: String
    let pattern: String
    let issuedAt: Double
    let expiresAt: Double
    let publisherId: String?
    let sessionId: String?
    let maneuverId: String?
    let cameraId: String?
    let preview: Bool?

    static func parse(_ payload: String) throws -> Self {
        guard let data = payload.data(using: .utf8), data.count <= 2_048 else { throw WatchPayloadError.invalid }
        let cue = try JSONDecoder().decode(Self.self, from: data)
        guard cue.version == 1, (1...240).contains(cue.id.count),
              ["left", "right", "neutral", "camera"].contains(cue.pattern),
              cue.issuedAt > 0, cue.expiresAt > cue.issuedAt,
              cue.expiresAt - cue.issuedAt <= 5_000 else { throw WatchPayloadError.invalid }
        if cue.preview != true {
            guard !(cue.publisherId ?? "").isEmpty else { throw WatchPayloadError.invalid }
            if cue.pattern == "camera" {
                guard !(cue.cameraId ?? "").isEmpty else { throw WatchPayloadError.invalid }
            } else {
                guard !(cue.sessionId ?? "").isEmpty, !(cue.maneuverId ?? "").isEmpty else { throw WatchPayloadError.invalid }
            }
        }
        return cue
    }

    func eligible(_ snapshot: WatchSnapshot?, at now: Double) -> Bool {
        guard now >= issuedAt - 5_000, now < expiresAt else { return false }
        if preview == true { return true }
        guard let snapshot, publisherId == snapshot.publisherId else { return false }
        if pattern == "camera" {
            guard let alert = snapshot.cameraAlert else { return false }
            return snapshot.cameraAlertsEnabled == true && cameraId == alert.id
                && !WatchContract.stale(alert.sourceAt, at: now)
        }
        return snapshot.hapticsEnabled != false && !snapshot.stale(at: now)
            && snapshot.navigation.status == "active" && sessionId == snapshot.sessionId
            && maneuverId == snapshot.navigation.maneuver?.id
    }
}

final class WatchHaptics {
    private var generation = 0

    func play(_ pattern: String) -> String? {
        guard WKApplication.shared().applicationState != .background else { return "Watch app in background" }
        generation += 1
        let token = generation
        let taps: [(Double, WKHapticType)]
        switch pattern {
        case "left": taps = [(0, .click)]
        case "right": taps = [(0, .click), (0.22, .click)]
        case "neutral": taps = [(0, .directionUp)]
        case "camera": taps = [(0, .click), (0.22, .click), (0.44, .click)]
        default: return "Unsupported pattern"
        }
        for (delay, type) in taps {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard self?.generation == token, WKApplication.shared().applicationState != .background else { return }
                WKInterfaceDevice.current().play(type)
            }
        }
        return nil
    }
}
