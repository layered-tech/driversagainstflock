import Foundation

enum WatchContract {
    static let version = 1
    static let staleAfter: Double = 15_000
    static var now: Double { Date().timeIntervalSince1970 * 1_000 }

    static func stale(_ source: Double?, at now: Double) -> Bool {
        guard let source else { return true }
        return now - source >= staleAfter || now < source - 5_000
    }
}

enum WatchPayloadError: Error {
    case invalid, incompatible(Int)
}

struct WatchSnapshot: Decodable {
    let protocolVersion: Int
    let publisherId: String
    let publisherStartedAt: Double
    let revision: Int
    let publishedAt: Double
    let environment: String
    let phoneVersion: String
    let hapticsEnabled: Bool?
    let cameraAlertsEnabled: Bool?
    let navigation: NavigationSnapshot
    let scorecard: ScorecardSnapshot
    let cameraAlert: CameraAlert?
    let areas: AreasSnapshot?
    let recap: DriveRecap?
    let currentPrivacyScore: Int?

    var sessionId: String? { navigation.sessionId }
    var cameraKey: String? {
        cameraAlert.map { "\(publisherId):\($0.id):\($0.issuedAt ?? 0)" }
    }
    func stale(at now: Double) -> Bool { WatchContract.stale(navigation.sourceAt, at: now) }

    static func parse(_ payload: String) throws -> Self {
        guard let data = payload.data(using: .utf8), data.count <= 65_536,
              let header = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let version = header["protocolVersion"] as? Int else { throw WatchPayloadError.invalid }
        guard version == WatchContract.version else { throw WatchPayloadError.incompatible(version) }
        let value = try JSONDecoder().decode(Self.self, from: data)
        guard (1...80).contains(value.publisherId.count), value.publisherStartedAt > 0,
              value.revision > 0, value.publishedAt > 0,
              ["production", "staging", "development", "e2e"].contains(value.environment),
              value.currentPrivacyScore.map({ (0...100).contains($0) }) ?? true,
              value.navigation.valid, value.scorecard.valid,
              value.cameraAlert?.valid ?? true, value.areas?.valid ?? true,
              value.recap?.valid ?? true else { throw WatchPayloadError.invalid }
        return value
    }
}

private func nonnegative(_ values: Double?...) -> Bool {
    values.allSatisfy { $0.map { $0.isFinite && $0 >= 0 } ?? true }
}

struct NavigationSnapshot: Decodable {
    let status: String
    let sessionId: String?
    let routeRevision: Int
    let sourceAt: Double?
    let destination: String
    let maneuver: Maneuver?
    let distanceRemainingMeters: Double?
    let durationRemainingSeconds: Double?
    let arrivalAt: Double?

    var valid: Bool {
        ["idle", "active", "rerouting", "waiting-for-location", "missing-maneuver"].contains(status)
            && routeRevision >= 0 && destination.count <= 240
            && (status == "idle" || !(sessionId ?? "").isEmpty)
            && (status != "active" || maneuver?.valid == true)
            && nonnegative(sourceAt, distanceRemainingMeters, durationRemainingSeconds, arrivalAt)
    }
}

struct Maneuver: Decodable {
    let id: String
    let kind: String
    let instruction: String
    let distanceMeters: Double?
    let exitNumber: Int?

    var valid: Bool {
        !id.isEmpty && instruction.count <= 240
            && ["left", "right", "sharp-left", "sharp-right", "slight-left", "slight-right",
                "keep-left", "keep-right", "straight", "roundabout", "uturn", "depart", "arrive"].contains(kind)
            && nonnegative(distanceMeters) && (exitNumber.map { $0 >= 0 } ?? true)
    }
    var description: String {
        if kind == "roundabout", let exitNumber, exitNumber > 0 { return "Roundabout, exit \(exitNumber)" }
        return ["uturn": "U-turn", "depart": "Depart", "arrive": "Arrive"][kind]
            ?? kind.replacingOccurrences(of: "-", with: " ").capitalized
    }
}

struct ScorecardSnapshot: Decodable {
    let status: String
    let sessionId: String?
    let sourceAt: Double?
    let elapsedSeconds: Double?
    let distanceMeters: Double?
    let confirmedCrossings: Int?
    let possibleCrossings: Int?
    let cameraCrossings: Int?
    let avoidedCameras: Int?

    var valid: Bool {
        ["active", "tracking-off", "initializing", "unavailable", "no-active-drive"].contains(status)
            && nonnegative(sourceAt, elapsedSeconds, distanceMeters)
            && [confirmedCrossings, possibleCrossings, cameraCrossings, avoidedCameras].allSatisfy { ($0 ?? 0) >= 0 }
    }
}

struct CameraAlert: Decodable, Identifiable {
    let id: String
    let type: String
    let road: String
    let distanceMeters: Double
    let count: Int
    let sourceAt: Double
    let issuedAt: Double?

    var valid: Bool {
        (1...80).contains(id.count) && type.count <= 40 && road.count <= 80
            && nonnegative(distanceMeters) && (1...100).contains(count)
            && sourceAt > 0 && (issuedAt.map { $0 > 0 } ?? true)
    }
}

struct AreasSnapshot: Decodable {
    let status: String
    let sourceAt: Double?
    let items: [WatchedArea]
    var unread: Int { items.reduce(0) { $0 + $1.unreadCount } }
    var valid: Bool {
        ["loading", "ready", "offline", "expired"].contains(status)
            && items.count <= 25 && items.allSatisfy(\.valid)
            && Set(items.map(\.id)).count == items.count && nonnegative(sourceAt)
    }
    func cached(at now: Double) -> Bool {
        status == "offline" || (sourceAt.map { now - $0 >= 3_600_000 || now < $0 - 5_000 } ?? true)
    }
}

struct WatchedArea: Decodable, Identifiable {
    let id: Int
    let name: String
    let unreadCount: Int
    let cameraCount: Int
    let addedCount: Int?
    let removedCount: Int?
    let changesStatus: String?
    let changes: [AreaChange]
    func activity(at now: Double) -> String {
        if changesStatus == "loading" { return "Checking recent changes" }
        if changesStatus == "unavailable" { return "Changes unavailable" }
        guard (addedCount ?? 0) + (removedCount ?? 0) > 0 else { return "Quiet week. Zero new boxes." }
        let counts = "+\(addedCount ?? 0) −\(removedCount ?? 0)"
        guard let latest = changes.compactMap(\.changedAt).max() else { return counts }
        return "\(counts) · \(WatchFormat.relative(latest, at: now))"
    }
    var valid: Bool {
        id > 0 && name.count <= 120 && unreadCount >= 0 && cameraCount >= 0
            && (addedCount ?? 0) >= 0 && (removedCount ?? 0) >= 0
            && ["loading", "ready", "unavailable"].contains(changesStatus ?? "ready")
            && changes.count <= 10 && changes.allSatisfy(\.valid)
            && Set(changes.map(\.id)).count == changes.count
    }
}

struct AreaChange: Decodable, Identifiable {
    let id: Int
    let kind: String
    let street: String
    let direction: String?
    let changedAt: Double?
    var valid: Bool { id > 0 && ["added", "removed"].contains(kind) && street.count <= 120 && nonnegative(changedAt) }
}

struct DriveRecap: Decodable {
    let status: String
    let id: String?
    let endedAt: Double?
    let durationSeconds: Double?
    let distanceMiles: Double?
    let confirmedCrossings: Int?
    let possibleCrossings: Int?
    let avoidedCameras: Int?
    let xpEarned: Int?
    let privacyScore: Int?
    let privacyScoreDelta: Int?
    var finished: Bool { ["completed", "canceled"].contains(status) }
    var valid: Bool {
        ["none", "initializing", "tracking-off", "completed", "canceled"].contains(status)
            && (!finished || ((1...80).contains(id?.count ?? 0) && (endedAt ?? 0) > 0))
            && nonnegative(durationSeconds, distanceMiles, endedAt)
            && [confirmedCrossings, possibleCrossings, avoidedCameras, xpEarned].allSatisfy { ($0 ?? 0) >= 0 }
            && (privacyScore.map { (0...100).contains($0) } ?? true)
    }
}

struct SnapshotGate {
    private(set) var current: WatchSnapshot?
    private var retired: [String] = []

    mutating func accept(_ next: WatchSnapshot) -> Bool {
        guard !retired.contains(next.publisherId) else { return false }
        if let previous = current {
            if next.publisherId == previous.publisherId {
                guard next.revision > previous.revision else { return false }
            } else {
                guard next.publisherStartedAt > previous.publisherStartedAt else { return false }
                retired.append(previous.publisherId)
                retired = Array(retired.suffix(16))
            }
        }
        current = next
        return true
    }
}

enum WatchCache {
    private static var file: URL? {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "DAFAppGroup") as? String else { return nil }
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?
            .appendingPathComponent("snapshot.json")
    }
    static func read() -> String? {
        guard let file, let data = try? Data(contentsOf: file) else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func save(_ payload: String) throws {
        guard let file, let data = payload.data(using: .utf8) else { throw WatchPayloadError.invalid }
        try data.write(to: file, options: .atomic)
    }
}

enum WatchFormat {
    static func maneuverDistance(_ meters: Double?) -> (value: String, unit: String) {
        guard let meters else { return ("—", "") }
        if meters <= 18.288 { return ("Now", "") }
        let parts = distance(meters).split(separator: " ", maxSplits: 1).map(String.init)
        return (parts[0], parts.count > 1 ? parts[1] : "")
    }
    static func distance(_ meters: Double?) -> String {
        guard let meters else { return "—" }
        if meters < 161 {
            let feet = meters <= 0 ? 0 : max(50, (meters * 3.28084 / 50).rounded() * 50)
            return String(format: "%.0f ft", feet)
        }
        return traveled(meters)
    }
    static func traveled(_ meters: Double?) -> String {
        guard let meters else { return "—" }
        let miles = meters / 1609.344
        return String(format: miles >= 10 ? "%.0f mi" : "%.1f mi", miles)
    }
    static func duration(_ seconds: Double?) -> String {
        guard let seconds else { return "—" }
        let minutes = max(1, Int((seconds / 60).rounded()))
        if minutes < 60 { return "\(minutes) min" }
        return minutes % 60 == 0 ? "\(minutes / 60) hr" : "\(minutes / 60) hr \(minutes % 60) min"
    }
    static func elapsed(_ seconds: Double?) -> String {
        guard let seconds else { return "—" }
        return String(format: "%d:%02d", Int(seconds) / 60, Int(seconds) % 60)
    }
    static func arrival(_ timestamp: Double?) -> String {
        guard let timestamp else { return "—" }
        return Date(timeIntervalSince1970: timestamp / 1_000).formatted(date: .omitted, time: .shortened)
    }
    static func relative(_ timestamp: Double?, at now: Double) -> String {
        guard let timestamp else { return "Not synced" }
        let minutes = Int(max(0, now - timestamp) / 60_000)
        if minutes < 1 { return "just now" }
        if minutes < 60 { return "\(minutes) min ago" }
        if minutes < 1_440 { return "\(minutes / 60)h ago" }
        return "\(minutes / 1_440)d ago"
    }
    static func count(_ value: Int?) -> String { value.map(String.init) ?? "—" }
}
