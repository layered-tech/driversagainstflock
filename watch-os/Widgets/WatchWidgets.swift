import SwiftUI
import WidgetKit

struct WatchEntry: TimelineEntry {
    let date: Date
    let snapshot: WatchSnapshot?
    var now: Double { date.timeIntervalSince1970 * 1_000 }
    var active: Bool {
        snapshot?.navigation.status == "active" && snapshot?.stale(at: now) == false
    }
    var areasAvailable: Bool {
        guard let areas = snapshot?.areas, let source = areas.sourceAt else { return false }
        return areas.status != "expired" && areas.status != "loading" && now - source < 86_400_000 && now >= source - 5_000
    }
    var score: Int? {
        snapshot?.sessionId == nil ? snapshot?.currentPrivacyScore : snapshot?.recap?.privacyScore
    }
    var cached: Bool { snapshot?.areas?.cached(at: now) ?? true }
}

struct WatchTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> WatchEntry { WatchEntry(date: .now, snapshot: nil) }
    func getSnapshot(in context: Context, completion: @escaping (WatchEntry) -> Void) {
        completion(entry())
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WatchEntry>) -> Void) {
        let current = entry()
        var entries = [current]
        // Pre-schedule expiry so a throttled reload cannot leave cached guidance labeled live.
        let boundaries = [
            current.snapshot?.navigation.sourceAt.map { $0 + WatchContract.staleAfter },
            current.snapshot?.areas?.sourceAt.map { $0 + 3_600_000 },
            current.snapshot?.areas?.sourceAt.map { $0 + 86_400_000 }
        ].compactMap { $0 }.filter { $0 > current.now }.sorted()
        for timestamp in boundaries {
            entries.append(WatchEntry(date: Date(timeIntervalSince1970: timestamp / 1_000), snapshot: current.snapshot))
        }
        completion(Timeline(entries: entries, policy: .after(Date().addingTimeInterval(15 * 60))))
    }
    private func entry() -> WatchEntry {
        WatchEntry(date: .now, snapshot: WatchCache.read().flatMap { try? WatchSnapshot.parse($0) })
    }
}

enum WatchWidgetKind: String {
    case overview = "DAFOverview", unread = "DAFUnreadAreas", privacy = "DAFPrivacyScore"
}

struct WatchWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WatchEntry
    let kind: WatchWidgetKind
    private var destination: URL { URL(string: kind == .privacy ? "daf-watch://scorecard" : "daf-watch://guidance")! }
    private var value: String {
        if kind == .privacy { return WatchFormat.count(entry.score) }
        if kind == .overview, entry.active { return WatchFormat.distance(entry.snapshot?.navigation.maneuver?.distanceMeters) }
        return entry.areasAvailable ? String(entry.snapshot?.areas?.unread ?? 0) : "—"
    }
    private var title: String {
        if kind == .privacy { return "Privacy score" }
        if kind == .overview, entry.active { return entry.snapshot?.navigation.maneuver?.instruction ?? "Guidance" }
        if entry.snapshot?.sessionId != nil && kind == .overview { return "Guidance paused" }
        return entry.areasAvailable ? "Unread changes" : "Open DAF to sync"
    }
    private var symbol: String { kind == .privacy ? "shield.lefthalf.filled" : "mappin.and.ellipse" }

    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                Label("\(value) · \(title)", systemImage: symbol)
            case .accessoryCircular:
                if kind == .privacy, let score = entry.score {
                    Gauge(value: Double(score), in: 0...100) {
                        Image(systemName: symbol)
                    } currentValueLabel: { Text(String(score)).font(.system(.title3, design: .monospaced)) }
                        .gaugeStyle(.accessoryCircular)
                } else {
                    VStack(spacing: 2) {
                        if kind == .overview, entry.active, let maneuver = entry.snapshot?.navigation.maneuver {
                            ManeuverGlyph(kind: maneuver.kind, exit: maneuver.exitNumber, size: 22)
                        } else { Image(systemName: symbol) }
                        Text(value).font(.system(.caption, design: .monospaced)).minimumScaleFactor(0.6).lineLimit(1)
                    }
                }
            default:
                VStack(alignment: .leading, spacing: 4) {
                    Text(kind == .privacy ? "DAF · SCORECARD" : entry.active && kind == .overview ? "DAF · NAVIGATING" : "DAF · MY AREAS")
                        .font(.caption2).foregroundStyle(.secondary)
                    HStack(spacing: 8) {
                        if kind == .overview, entry.active, let maneuver = entry.snapshot?.navigation.maneuver {
                            ManeuverGlyph(kind: maneuver.kind, exit: maneuver.exitNumber, size: 30)
                        }
                        Text(value).font(.system(.title2, design: .monospaced).weight(.semibold)).foregroundStyle(WatchDesign.brand)
                        if kind != .overview || !entry.active {
                            Text(title).font(.caption).lineLimit(2)
                        }
                    }
                    if kind == .overview, entry.active {
                        Text(title).font(.caption).lineLimit(1)
                    } else if kind != .privacy, entry.areasAvailable {
                        Text(entry.cached ? "Cached · \(WatchFormat.relative(entry.snapshot?.areas?.sourceAt, at: entry.now))"
                             : "\(entry.snapshot?.areas?.items.count ?? 0) areas watched")
                            .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .containerBackground(.black, for: .widget)
        .widgetURL(destination)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(value)\(entry.cached && kind != .privacy && !entry.active ? ", cached" : "")")
    }
}

struct DAFWatchWidget: Widget {
    let kind: WatchWidgetKind
    let name: String
    let detail: String

    init() {
        self.init(kind: .overview, name: "Drivers Against Flock", detail: "Guidance while navigating, My Areas between drives.")
    }

    init(kind: WatchWidgetKind, name: String, detail: String) {
        self.kind = kind
        self.name = name
        self.detail = detail
    }

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind.rawValue, provider: WatchTimelineProvider()) { entry in
            WatchWidgetView(entry: entry, kind: kind)
        }
        .configurationDisplayName(name)
        .description(detail)
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

@main
struct DAFWatchWidgets: WidgetBundle {
    var body: some Widget {
        DAFWatchWidget(kind: .overview, name: "Drivers Against Flock", detail: "Guidance while navigating, My Areas between drives.")
        DAFWatchWidget(kind: .unread, name: "My Areas", detail: "Unread camera changes in your watched areas.")
        DAFWatchWidget(kind: .privacy, name: "Privacy score", detail: "Your latest privacy score from the phone.")
    }
}
