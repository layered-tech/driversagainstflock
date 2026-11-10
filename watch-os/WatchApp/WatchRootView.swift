import SwiftUI

struct WatchRootView: View {
    @EnvironmentObject private var repository: WatchRepository
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.isLuminanceReduced) private var ambient
    @State private var recapElapsed: Double = 0
    @State private var recapDismissed = false
    @State private var recapInteracted = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: ambient ? 60 : 1)) { context in
            let now = context.date.timeIntervalSince1970 * 1_000
            if repository.snapshot?.sessionId != nil {
                TabView(selection: Binding(get: { min(repository.page, 2) }, set: { repository.page = $0 })) {
                    NavigationStack {
                        primary(at: now).navigationTitle("DAF").navigationBarTitleDisplayMode(.inline)
                    }.id(repository.snapshot?.sessionId).tag(0)
                    NavigationStack {
                        WatchPage { ScorecardPage(now: now) }
                            .navigationTitle("Scorecard").navigationBarTitleDisplayMode(.inline)
                    }.tag(1)
                    NavigationStack {
                        WatchPage { DiagnosticsPage(now: now) }
                            .navigationTitle("Diagnostics").navigationBarTitleDisplayMode(.inline)
                    }.tag(2)
                }
                .tabViewStyle(.verticalPage)
                .sheet(isPresented: destination(3)) {
                    NavigationStack {
                        WatchPage { HapticsPage() }
                            .navigationTitle("Feel the turns").navigationBarTitleDisplayMode(.inline)
                    }
                }
            } else {
                NavigationStack {
                    primary(at: now)
                        .navigationTitle(primaryTitle(at: now)).navigationBarTitleDisplayMode(.inline)
                        .navigationDestination(isPresented: destination(1)) {
                            WatchPage { ScorecardPage(now: now) }
                                .navigationTitle("Scorecard").navigationBarTitleDisplayMode(.inline)
                        }
                        .navigationDestination(isPresented: destination(2)) {
                            WatchPage { DiagnosticsPage(now: now) }
                                .navigationTitle("Diagnostics").navigationBarTitleDisplayMode(.inline)
                        }
                        .navigationDestination(isPresented: destination(3)) {
                            WatchPage { HapticsPage() }
                                .navigationTitle("Feel the turns").navigationBarTitleDisplayMode(.inline)
                        }
                }
            }
        }
        .font(WatchDesign.sans(15))
        .background(Color.black)
        .onChange(of: repository.endedAt) { _, _ in
            recapElapsed = 0
            recapDismissed = false
            recapInteracted = false
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            repository.refresh(request: true)
            repository.requestNotificationPermission()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                repository.refresh()
                if !ambient, repository.endedAt != nil { recapElapsed += 1 }
            }
        }
    }

    private func destination(_ page: Int) -> Binding<Bool> {
        Binding(get: { repository.page == page }, set: { shown in
            if !shown && repository.page == page { repository.page = 0 }
        })
    }

    private var currentRecap: DriveRecap? {
        let recap = repository.snapshot?.recap
        let matches = recap?.finished != true
            || abs((recap?.endedAt ?? 0) - (repository.endedAt ?? 0)) <= 60_000
        return matches ? recap : nil
    }

    private func showsRecap(at now: Double) -> Bool {
        guard let endedAt = repository.endedAt, now - endedAt < 120_000, !recapDismissed else { return false }
        let waiting = currentRecap == nil || ["none", "initializing"].contains(currentRecap?.status ?? "none")
        return recapInteracted || recapElapsed < (waiting ? 60 : 23)
    }

    private func primaryTitle(at now: Double) -> String {
        if showsRecap(at: now), recapElapsed >= 3 {
            return currentRecap?.status == "canceled" ? "Route canceled" : "Drive complete"
        }
        return "My areas"
    }

    @ViewBuilder private func primary(at now: Double) -> some View {
        let snapshot = repository.snapshot
        if repository.incompatible {
            WatchCanvas { WatchMessage("Update needed", "Update both apps to restore the watch connection.", symbol: "iphone") }
        } else if let endedAt = repository.endedAt, now - endedAt < 120_000, recapElapsed < 3 {
            WatchCanvas {
                WatchMessage(repository.endedByArrival ? "Arrived" : "Route ended", "Returning to idle", symbol: "flag.checkered")
            }
        } else if showsRecap(at: now) {
            RecapPage(recap: currentRecap, elapsed: recapElapsed, interacted: recapInteracted,
                      onInteraction: { recapInteracted = true }, onDismiss: { recapDismissed = true })
        } else if !repository.connectionChecked {
            WatchCanvas { WatchMessage("Connecting to phone", "Usually a second or two.", symbol: "iphone.radiowaves.left.and.right") }
        } else if snapshot?.sessionId != nil {
            GuidancePage(now: now)
        } else if let alert = snapshot?.cameraAlert, snapshot?.cameraAlertsEnabled == true,
                  !WatchContract.stale(alert.sourceAt, at: now), alert.id != repository.dismissedCameraId {
            CameraPage(alert: alert)
        } else if let areas = snapshot?.areas {
            GeometryReader { geometry in
                WatchPage {
                    VStack(alignment: .leading, spacing: WatchDesign.gap) {
                        AreasPage(areas: areas, now: now)
                    }.frame(minHeight: max(0, geometry.size.height - 10), alignment: .topLeading)
                    if !ambient { IdleWatchLinks() }
                }
            }
        } else if !repository.connected {
            WatchPage {
                WatchMessage("Phone disconnected", "Open DAF on your iPhone to reconnect.", symbol: "iphone.slash", tone: WatchDesign.alert)
                Button("Retry") { repository.refresh(request: true) }
                IdleWatchLinks()
            }
        } else if snapshot == nil {
            WatchCanvas { WatchMessage("Connecting to phone", "Waiting for the latest update.", symbol: "arrow.triangle.2.circlepath") }
        } else {
            WatchPage {
                WatchMessage("Start a route", "On your iPhone", symbol: "location")
                IdleWatchLinks()
            }
        }
    }
}

struct WatchPage<Content: View>: View {
    @ViewBuilder let content: () -> Content
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: WatchDesign.gap, content: content)
                    .frame(maxWidth: .infinity, minHeight: max(0, geometry.size.height - 10), alignment: .topLeading)
                    .padding(.bottom, 10)
            }
        }
        .padding(.horizontal, WatchDesign.inset)
    }
}

struct WatchCanvas<Content: View>: View {
    @ViewBuilder let content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: WatchDesign.gap, content: content)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.horizontal, WatchDesign.inset).padding(.bottom, 10)
    }
}

struct IdleWatchLinks: View {
    var body: some View {
        VStack(spacing: WatchDesign.gap) {
            NavigationLink {
                WatchPage { ScorecardPage(now: WatchContract.now) }
                    .navigationTitle("Scorecard").navigationBarTitleDisplayMode(.inline)
            } label: { WatchUtilityRow(title: "Scorecard", symbol: "shield.lefthalf.filled") }
            NavigationLink {
                WatchPage { HapticsPage() }
                    .navigationTitle("Feel the turns").navigationBarTitleDisplayMode(.inline)
            } label: { WatchUtilityRow(title: "Feel the turns", symbol: "waveform") }
            NavigationLink {
                WatchPage { DiagnosticsPage(now: WatchContract.now) }
                    .navigationTitle("Diagnostics").navigationBarTitleDisplayMode(.inline)
            } label: { WatchUtilityRow(title: "Diagnostics", symbol: "info.circle") }
        }.buttonStyle(WatchCardButtonStyle()).padding(.top, 12)
    }
}

struct WatchUtilityRow: View {
    let title: String
    let symbol: String
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol).foregroundStyle(WatchDesign.muted)
            Text(title).font(WatchDesign.sans(14)).frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(.white.opacity(0.35))
        }.padding(.horizontal, 14).frame(minHeight: 44)
    }
}

struct WatchMessage: View {
    let title: String
    let detail: String
    let symbol: String
    var tone: Color = WatchDesign.muted
    init(_ title: String, _ detail: String, symbol: String, tone: Color = WatchDesign.muted) {
        self.title = title; self.detail = detail; self.symbol = symbol; self.tone = tone
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: symbol).font(.system(size: 34)).foregroundStyle(tone).accessibilityHidden(true)
            Text(title).font(WatchDesign.sans(20)).foregroundStyle(.white)
            Text(detail).font(WatchDesign.sans(14)).foregroundStyle(WatchDesign.muted)
        }.multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading).padding(.horizontal, 4).padding(.vertical, 12)
    }
}

struct StatusPill: View {
    let text: String
    var color: Color = WatchDesign.brand
    var body: some View {
        Text(text).font(WatchDesign.sans(12)).foregroundStyle(color)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(color.opacity(0.14), in: Capsule())
    }
}

struct GuidancePage: View {
    @EnvironmentObject private var repository: WatchRepository
    @Environment(\.isLuminanceReduced) private var ambient
    @State private var liveSince = WatchContract.now
    let now: Double
    var body: some View {
        GeometryReader { geometry in
            if let snapshot = repository.snapshot {
                let nav = snapshot.navigation
                let age = nav.sourceAt.map { max(0, now - $0) / 1_000 }
                VStack(alignment: .leading, spacing: geometry.size.height < 210 ? 4 : 6) {
                    if !repository.connected {
                        WatchMessage("Phone disconnected", "Guidance resumes when it reconnects.", symbol: "iphone.slash", tone: WatchDesign.alert)
                    } else if nav.status == "active" && (age == nil || (age ?? 0) >= 30) {
                        WatchMessage(age.map { "Last update \(Int($0)) s ago" } ?? "Waiting for an update",
                                     "Showing what we had. Keep following the iPhone.", symbol: "clock.arrow.circlepath", tone: WatchDesign.amber)
                    } else {
                        switch nav.status {
                        case "rerouting":
                            WatchMessage("Rerouting", "Keep driving. New route in a moment.", symbol: "arrow.triangle.2.circlepath", tone: WatchDesign.amber)
                        case "waiting-for-location":
                            WatchMessage("Waiting for location", "Guidance starts when the iPhone has a fix.", symbol: "location.viewfinder")
                        case "missing-maneuver":
                            WatchMessage("Follow the road", "Waiting for the next instruction from your iPhone.", symbol: "arrow.up")
                        default:
                            guidance(snapshot, compact: geometry.size.height < 210)
                        }
                    }
                }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }.padding(.horizontal, WatchDesign.inset).padding(.bottom, 10)
            .task(id: repository.snapshot?.sessionId) { liveSince = WatchContract.now }
    }

    @ViewBuilder private func guidance(_ snapshot: WatchSnapshot, compact: Bool) -> some View {
        let nav = snapshot.navigation
        let stale = snapshot.stale(at: now) || (nav.sourceAt.map { now - $0 > 10_000 } ?? true)
        let tone = ambient ? WatchDesign.muted : stale ? .white : WatchDesign.brand
        let alert = snapshot.cameraAlert.flatMap { alert in
            snapshot.cameraAlertsEnabled == true && !stale && !WatchContract.stale(alert.sourceAt, at: now)
                && alert.id != repository.dismissedCameraId ? alert : nil
        }
        if !ambient && (stale || now - liveSince < 3_000) {
            StatusPill(text: stale ? "Stale · \(Int(max(0, now - (nav.sourceAt ?? now)) / 1_000))s" : "Live",
                       color: stale ? WatchDesign.amber : WatchDesign.brand)
        }
        if let maneuver = nav.maneuver {
            HStack(spacing: 8) {
                ManeuverGlyph(kind: maneuver.kind, exit: maneuver.exitNumber,
                              size: alert != nil || compact ? 48 : 52, color: tone)
                ManeuverDistance(meters: maneuver.distanceMeters, size: alert != nil ? 30 : compact ? 34 : 38)
            }.opacity(stale ? 0.6 : 1).layoutPriority(1)
            Text(maneuver.instruction.isEmpty ? "Follow the road" : maneuver.instruction)
                .font(WatchDesign.sans(17)).tracking(-0.2).multilineTextAlignment(.leading)
                .lineLimit(alert != nil ? 1 : 2).minimumScaleFactor(0.85).layoutPriority(1)
        }
        if !ambient && alert == nil && !nav.destination.isEmpty {
            HStack(spacing: 4) {
                Image(systemName: "mappin").foregroundStyle(WatchDesign.violet)
                Text(nav.destination).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
            }.font(.system(size: 13, weight: .medium))
        }
        Spacer(minLength: 0)
        if let alert {
            Button { repository.dismissCamera() } label: { CameraStrip(alert: alert) }
                .buttonStyle(.plain).disabled(ambient).layoutPriority(2)
                .accessibilityHint("Dismiss camera alert")
        } else if let alert = repository.recentCameraAlert, now - (repository.cameraEndedAt ?? 0) < 5_000 {
            CameraStrip(alert: alert, passed: true).layoutPriority(2)
        } else if !ambient {
            TripStrip(navigation: nav).layoutPriority(2)
        }
        if !ambient && snapshot.hapticsEnabled == false {
            Label("Haptics off", systemImage: "waveform.slash").font(WatchDesign.sans(11)).foregroundStyle(WatchDesign.muted)
        }
    }
}

struct ManeuverDistance: View {
    let meters: Double?
    var size: CGFloat = 38
    var body: some View {
        let distance = WatchFormat.maneuverDistance(meters)
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(distance.value).font(WatchDesign.mono(size)).foregroundStyle(.white)
            if !distance.unit.isEmpty {
                Text(distance.unit).font(WatchDesign.mono(size * 0.4)).foregroundStyle(.white.opacity(0.65))
            }
        }.lineLimit(1).minimumScaleFactor(0.65).monospacedDigit()
            .accessibilityElement(children: .combine)
    }
}

struct TripStrip: View {
    let navigation: NavigationSnapshot
    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text(WatchFormat.arrival(navigation.arrivalAt)).font(WatchDesign.mono(17)).foregroundStyle(WatchDesign.brand)
                Text("ARRIVE").font(WatchDesign.sans(9)).tracking(0.5).foregroundStyle(.white.opacity(0.5))
            }.frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 3) {
                Text(WatchFormat.duration(navigation.durationRemainingSeconds)).foregroundStyle(.white.opacity(0.75))
                Text(WatchFormat.distance(navigation.distanceRemainingMeters)).foregroundStyle(.white.opacity(0.55))
            }.font(WatchDesign.mono(12))
        }.monospacedDigit().lineLimit(1).minimumScaleFactor(0.75)
            .padding(.horizontal, 13).padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 18))
            .accessibilityElement(children: .combine)
    }
}

struct ScorecardPage: View {
    @EnvironmentObject private var repository: WatchRepository
    @Environment(\.isLuminanceReduced) private var ambient
    let now: Double
    var body: some View {
        if repository.incompatible {
            WatchMessage("Update needed", "Update both apps.", symbol: "iphone")
        } else if let score = repository.snapshot?.scorecard {
            switch score.status {
            case "tracking-off": WatchMessage("Tracking is off", "Turn it on in the iPhone app to see drive metrics.", symbol: "eye.slash")
            case "initializing": WatchMessage("Starting up", "First metrics in a few seconds.", symbol: "hourglass")
            case "unavailable": WatchMessage("Metrics paused", "iPhone is catching up.", symbol: "clock.arrow.circlepath", tone: WatchDesign.amber)
            case "active":
                if !ambient {
                    let stale = !repository.connected || WatchContract.stale(score.sourceAt, at: now)
                    StatusPill(text: stale ? "Metrics paused" : "Tracking", color: stale ? WatchDesign.amber : WatchDesign.brand)
                }
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(WatchFormat.elapsed(score.elapsedSeconds)).font(WatchDesign.mono(40))
                        .monospacedDigit().minimumScaleFactor(0.6).lineLimit(1)
                    Text("elapsed").font(.system(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.55))
                }.padding(.horizontal, 2)
                ScoreMetricRow(title: "Distance", value: WatchFormat.traveled(score.distanceMeters), symbol: "point.bottomleft.forward.to.point.topright.scurvepath")
                ScoreMetricRow(title: "Avoided", value: WatchFormat.count(score.avoidedCameras), symbol: "checkmark.shield", color: ambient ? WatchDesign.muted : WatchDesign.brand)
                ScoreMetricRow(title: "Crossed", value: WatchFormat.count(score.cameraCrossings), symbol: "video", color: ambient ? WatchDesign.muted : (score.cameraCrossings ?? 0) > 0 ? WatchDesign.alert : .white)
            default: WatchMessage("No drive yet", "Metrics appear when a route starts on your iPhone.", symbol: "location")
            }
        } else {
            WatchMessage("Starting up", "Waiting for drive metrics.", symbol: "hourglass")
        }
    }
}

struct ScoreMetricRow: View {
    let title: String
    let value: String
    let symbol: String
    var color: Color = .white
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol).font(.system(size: 16)).foregroundStyle(color).frame(width: 16).accessibilityHidden(true)
            Text(title).font(.system(size: 14, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading)
            Text(value).font(WatchDesign.mono(17)).monospacedDigit().foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.7)
        }.padding(.horizontal, 12).padding(.vertical, 8).frame(minHeight: 38)
            .background(WatchDesign.card, in: RoundedRectangle(cornerRadius: 18))
            .accessibilityElement(children: .combine)
    }
}

struct CameraStrip: View {
    let alert: CameraAlert
    var passed = false
    @Environment(\.isLuminanceReduced) private var ambient
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "video.fill").accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(passed ? "Passed camera" : "\(alert.count > 1 ? "\(alert.count) cameras" : alert.type) · \(WatchFormat.distance(alert.distanceMeters))")
                    .font(WatchDesign.sans(13))
                if !alert.road.isEmpty { Text(alert.road).font(WatchDesign.sans(12)).foregroundStyle(WatchDesign.muted) }
            }
            Spacer(minLength: 0)
        }.padding(10).frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(passed || ambient ? WatchDesign.muted : WatchDesign.alert)
            .background((passed || ambient ? WatchDesign.muted : WatchDesign.alert).opacity(0.15), in: RoundedRectangle(cornerRadius: 16))
    }
}

struct CameraPage: View {
    @EnvironmentObject private var repository: WatchRepository
    @Environment(\.isLuminanceReduced) private var ambient
    let alert: CameraAlert
    var body: some View {
        WatchCanvas {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: "video.fill").font(.system(size: 34)).foregroundStyle(ambient ? WatchDesign.muted : WatchDesign.alert)
                Text(alert.count > 1 ? "\(alert.count) cameras ahead" : "Camera ahead").font(WatchDesign.sans(20))
                Text(WatchFormat.distance(alert.distanceMeters)).font(WatchDesign.mono(36)).lineLimit(1).minimumScaleFactor(0.6)
                Text([alert.type, alert.road].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.system(size: 13, weight: .medium)).foregroundStyle(WatchDesign.muted)
            }.multilineTextAlignment(.leading).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            if !ambient {
                Button { repository.dismissCamera() } label: {
                    Text("Dismiss").frame(maxWidth: .infinity, minHeight: 44)
                }.buttonStyle(WatchCardButtonStyle())
            }
        }
    }
}

struct AreasPage: View {
    @EnvironmentObject private var repository: WatchRepository
    @Environment(\.isLuminanceReduced) private var ambient
    let areas: AreasSnapshot
    let now: Double
    var body: some View {
        if ambient {
            Text(String(areas.unread)).font(WatchDesign.mono(40))
            Text("unread changes").foregroundStyle(WatchDesign.muted)
        } else if areas.status == "loading" {
            WatchMessage("Checking your areas", "Syncing with your iPhone…", symbol: "arrow.triangle.2.circlepath")
        } else if areas.status == "expired" {
            WatchMessage("Subscription session expired", "Open My Areas on your iPhone to reconnect.", symbol: "iphone", tone: WatchDesign.amber)
            PhoneHandoffButton { repository.openOnPhone("areas") }
        } else {
            if areas.cached(at: now) || !repository.connected {
                StatusPill(text: "Cached · counts may be behind", color: WatchDesign.amber)
            }
            if areas.items.isEmpty {
                if areas.status == "offline" {
                    WatchMessage("Phone unavailable", "Reconnect to see your areas.", symbol: "iphone.slash")
                    Button("Retry") { repository.refresh(request: true) }
                } else {
                    WatchMessage("No areas yet", "Watch a city or ZIP in the iPhone app.", symbol: "mappin.slash")
                }
            } else {
                ForEach(areas.items) { area in
                    NavigationLink {
                        AreaPage(areaId: area.id).onAppear { repository.areaOpened(area.id) }
                    } label: {
                        AreaRow(area: area, now: now)
                    }.buttonStyle(WatchCardButtonStyle())
                }
                Spacer(minLength: 0)
                Text("Start a route on your iPhone")
                    .font(WatchDesign.sans(12)).foregroundStyle(.white.opacity(0.5))
                    .frame(maxWidth: .infinity).padding(.top, 4)
            }
        }
    }
}

struct AreaRow: View {
    let area: WatchedArea
    let now: Double
    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text(area.name).font(WatchDesign.sans(15)).foregroundStyle(.white).lineLimit(1)
                Text(area.activity(at: now)).font(WatchDesign.sans(12))
                    .foregroundStyle(.white.opacity(0.6)).lineLimit(1)
            }.frame(maxWidth: .infinity, alignment: .leading)
            if area.unreadCount > 0 {
                Text(String(area.unreadCount)).font(WatchDesign.mono(12)).foregroundStyle(.white)
                    .padding(.horizontal, 6).frame(minWidth: 22, minHeight: 22)
                    .background(WatchDesign.alert, in: Capsule())
                    .accessibilityLabel("\(area.unreadCount) unread changes")
            }
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.35)).accessibilityHidden(true)
        }.padding(.leading, 14).padding(.trailing, 12).padding(.vertical, 10)
            .frame(minHeight: 56).multilineTextAlignment(.leading)
    }
}

struct AreaPage: View {
    @EnvironmentObject private var repository: WatchRepository
    let areaId: Int
    private var area: WatchedArea? { repository.snapshot?.areas?.items.first(where: { $0.id == areaId }) }
    var body: some View {
        WatchPage {
            if let areas = repository.snapshot?.areas, let area {
                if areas.cached(at: WatchContract.now) || !repository.connected {
                    StatusPill(text: "Cached · counts may be behind", color: WatchDesign.amber)
                }
                if area.changes.isEmpty {
                    Text(area.changesStatus == "loading" ? "Checking recent changes"
                        : area.changesStatus == "unavailable" ? "Changes unavailable on watch" : "No changes this week")
                        .font(WatchDesign.sans(15)).foregroundStyle(WatchDesign.muted).padding(.vertical, 12)
                }
                ForEach(area.changes) { change in
                    NavigationLink {
                        AreaChangePage(areaId: areaId, changeId: change.id).onAppear { repository.resetHandoff() }
                    } label: {
                        HStack(spacing: 9) {
                            ChangeDisc(added: change.kind == "added", size: 26)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(change.street).font(WatchDesign.sans(14)).foregroundStyle(.white).lineLimit(1)
                                Text("\(change.kind == "added" ? "Added · ALPR" : "Removed") · \(WatchFormat.relative(change.changedAt, at: WatchContract.now))")
                                    .font(WatchDesign.sans(12)).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }.padding(.leading, 11).padding(.trailing, 12).padding(.vertical, 10)
                            .frame(minHeight: 56).multilineTextAlignment(.leading)
                    }.buttonStyle(WatchCardButtonStyle())
                }
                Spacer(minLength: 0)
                Text("\(area.cameraCount) cameras · \(area.changes.count) changes this week")
                    .font(WatchDesign.sans(12)).foregroundStyle(.white.opacity(0.5))
                    .frame(maxWidth: .infinity).padding(.top, 4)
            } else {
                WatchMessage("Area unavailable", "Refresh My Areas on your iPhone.", symbol: "mappin.slash")
            }
        }.navigationTitle(area?.name ?? "My areas").navigationBarTitleDisplayMode(.inline)
    }
}

struct ChangeDisc: View {
    let added: Bool
    var size: CGFloat = 34
    var body: some View {
        Image(systemName: added ? "plus" : "minus")
            .font(.system(size: size * 0.53, weight: .bold))
            .foregroundStyle(added ? WatchDesign.alert : WatchDesign.muted)
            .frame(width: size, height: size)
            .background((added ? WatchDesign.alert : WatchDesign.muted).opacity(0.22), in: Circle())
            .accessibilityHidden(true)
    }
}

struct AreaChangePage: View {
    @EnvironmentObject private var repository: WatchRepository
    let areaId: Int
    let changeId: Int
    private var area: WatchedArea? { repository.snapshot?.areas?.items.first(where: { $0.id == areaId }) }
    var body: some View {
        WatchPage {
            if let area, let change = area.changes.first(where: { $0.id == changeId }) {
                VStack(alignment: .leading, spacing: 5) {
                    ChangeDisc(added: change.kind == "added").padding(.bottom, 4)
                    Text(change.kind == "added" ? "New ALPR camera" : "Camera removed")
                        .font(WatchDesign.sans(19)).tracking(-0.2).foregroundStyle(.white)
                    Text(change.street).font(.system(size: 15, weight: .medium)).foregroundStyle(.white.opacity(0.88))
                    Text([area.name, WatchFormat.relative(change.changedAt, at: WatchContract.now),
                          change.direction.flatMap { $0.isEmpty ? nil : "faces \($0)" }].compactMap { $0 }.joined(separator: " · "))
                        .font(.system(size: 13, weight: .medium)).foregroundStyle(.white.opacity(0.55))
                }.multilineTextAlignment(.leading).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                    .padding(.horizontal, 4).padding(.vertical, 6)
                Spacer(minLength: 0)
                PhoneHandoffButton { repository.openOnPhone("area-change", areaId: areaId, changeId: changeId) }
            } else {
                WatchMessage("Change unavailable", "Open My Areas on your iPhone.", symbol: "iphone")
            }
        }.navigationTitle(area?.name ?? "Camera change").navigationBarTitleDisplayMode(.inline)
    }
}

struct PhoneHandoffButton: View {
    @EnvironmentObject private var repository: WatchRepository
    let action: () -> Void
    private var label: String {
        switch repository.handoffStatus {
        case "sending": return "Sending…"
        case "opened": return "On your iPhone"
        case "queued": return "Open DAF on iPhone"
        case "failed": return "Try again"
        default: return repository.connected ? "Open on iPhone" : "Phone unavailable"
        }
    }
    private var symbol: String {
        switch repository.handoffStatus {
        case "opened": return "checkmark"
        case "failed": return "arrow.clockwise"
        default: return "iphone"
        }
    }
    var body: some View {
        VStack(spacing: 4) {
            Button(action: action) {
                HStack(spacing: 6) {
                    if repository.handoffStatus == "sending" { ProgressView().controlSize(.mini).tint(.white) }
                    else { Image(systemName: symbol) }
                    Text(label).lineLimit(1).minimumScaleFactor(0.8)
                }.font(WatchDesign.sans(15)).frame(maxWidth: .infinity, minHeight: 44)
                    .foregroundStyle(repository.connected && repository.handoffStatus == "idle"
                                     ? Color(red: 6 / 255, green: 40 / 255, blue: 26 / 255) : .white)
                    .background(repository.connected && repository.handoffStatus == "idle" ? WatchDesign.brand : WatchDesign.card, in: Capsule())
            }.buttonStyle(.plain).disabled(!repository.connected || repository.handoffStatus == "sending")
            if repository.handoffStatus == "failed" {
                Text("Didn't reach your iPhone").font(WatchDesign.sans(12)).foregroundStyle(WatchDesign.amber)
            }
            if repository.handoffStatus == "queued" {
                Text("Continue in the iPhone app.").font(WatchDesign.sans(12)).foregroundStyle(WatchDesign.muted)
            }
        }
    }
}

struct RecapPage: View {
    @EnvironmentObject private var repository: WatchRepository
    @Environment(\.isLuminanceReduced) private var ambient
    let recap: DriveRecap?
    let elapsed: Double
    let interacted: Bool
    let onInteraction: () -> Void
    let onDismiss: () -> Void
    private var finalized: Bool { recap?.finished == true }
    private var trackingOff: Bool { recap?.status == "tracking-off" }
    var body: some View {
        GeometryReader { geometry in
            let compact = geometry.size.height < 200
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    scoreDelta(compact: compact)
                    HStack(spacing: 4) {
                        RecapMetric(title: "TIME", value: WatchFormat.elapsed(recap?.durationSeconds), compact: compact)
                        RecapMetric(title: "MI", value: recap?.distanceMiles.map { String(format: "%.1f", $0) } ?? "—", compact: compact)
                        RecapMetric(title: "XP", value: finalized ? recap?.xpEarned.map { "+\($0)" } ?? "—" : "—", color: WatchDesign.brand, compact: compact)
                    }
                    HStack(spacing: 4) {
                        RecapMetric(title: "AVOIDED", value: finalized ? WatchFormat.count(recap?.avoidedCameras) : "—",
                                    symbol: "checkmark.shield", color: WatchDesign.brand, compact: compact)
                        let crossed = recap.flatMap { recap in recap.confirmedCrossings.map { $0 + (recap.possibleCrossings ?? 0) } }
                        RecapMetric(title: "CROSSED", value: finalized ? WatchFormat.count(crossed) : "—",
                                    symbol: "video", color: (crossed ?? 0) > 0 ? WatchDesign.alert : .white, compact: compact)
                    }
                    if !finalized {
                        Text(trackingOff ? "Turn on tracking in the iPhone app to score drives." : "Score and XP arrive when the iPhone finishes.")
                            .font(.system(size: 13, weight: .medium)).foregroundStyle(.white.opacity(0.8))
                            .frame(maxWidth: .infinity, alignment: .leading).padding(10)
                            .background(WatchDesign.card, in: RoundedRectangle(cornerRadius: 18))
                    }
                    Spacer(minLength: 0)
                    if !ambient {
                        if finalized, let id = recap?.id {
                            PhoneHandoffButton { onInteraction(); repository.openOnPhone("scorecard", driveId: id) }
                        }
                        if !finalized && !trackingOff {
                            Text("Waiting · no auto-close").font(WatchDesign.sans(12)).foregroundStyle(.white.opacity(0.5))
                        } else if !interacted, elapsed >= 8, elapsed < 23 {
                            Text("Closes in \(23 - Int(elapsed)) s").font(WatchDesign.sans(12)).foregroundStyle(.white.opacity(0.5))
                        }
                    }
                }.frame(maxWidth: .infinity, minHeight: max(0, geometry.size.height - 10), alignment: .topLeading)
                    .padding(.bottom, 10)
                    .simultaneousGesture(DragGesture(minimumDistance: 5).onChanged { _ in onInteraction() })
                    .simultaneousGesture(TapGesture().onEnded { onInteraction() })
            }
        }.padding(.horizontal, WatchDesign.inset)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: onDismiss) { Image(systemName: "xmark") }.accessibilityLabel("Dismiss recap")
                }
            }
    }

    private func scoreDelta(compact: Bool) -> some View {
        HStack(spacing: 8) {
            Text(finalized ? recap?.privacyScoreDelta.map { $0 >= 0 ? "+\($0)" : String($0) } ?? "—" : "—")
                .font(WatchDesign.mono(compact ? 32 : 40)).monospacedDigit()
                .foregroundStyle(finalized && !ambient ? WatchDesign.brand : WatchDesign.muted)
            VStack(alignment: .leading, spacing: 4) {
                if finalized {
                    Text("→ \(WatchFormat.count(recap?.privacyScore))").font(WatchDesign.mono(15)).foregroundStyle(.white.opacity(0.7))
                }
                Text(finalized ? "Privacy score" : trackingOff ? "Tracking is off" : "Finalizing on iPhone…")
                    .font(.system(size: 11, weight: .medium)).foregroundStyle(.white.opacity(0.55))
            }
        }.lineLimit(1).minimumScaleFactor(0.7).padding(.horizontal, 4)
    }
}

struct RecapMetric: View {
    let title: String
    let value: String
    var symbol: String? = nil
    var color: Color = .white
    var compact = false
    @Environment(\.isLuminanceReduced) private var ambient
    var body: some View {
        HStack(spacing: 6) {
            if let symbol {
                Image(systemName: symbol).font(.system(size: 16)).foregroundStyle(ambient ? WatchDesign.muted : color).accessibilityHidden(true)
            }
            VStack(alignment: symbol == nil ? .center : .leading, spacing: 3) {
                Text(value).font(WatchDesign.mono(symbol == nil ? 15 : 17)).monospacedDigit()
                    .foregroundStyle(ambient ? WatchDesign.muted : color).lineLimit(1).minimumScaleFactor(0.6)
                Text(title).font(WatchDesign.sans(9)).tracking(0.5).foregroundStyle(.white.opacity(0.55)).lineLimit(1).minimumScaleFactor(0.7)
            }
        }.frame(maxWidth: .infinity, alignment: symbol == nil ? .center : .leading)
            .padding(.horizontal, symbol == nil ? 3 : 8).padding(.vertical, compact ? 2 : 8)
            .background(WatchDesign.card, in: RoundedRectangle(cornerRadius: 16))
            .accessibilityElement(children: .combine)
    }
}

struct DiagnosticsPage: View {
    @EnvironmentObject private var repository: WatchRepository
    let now: Double
    private var rows: [(String, String)] {
        let snapshot = repository.snapshot
        return [
            ("Connection", repository.connected ? "Reachable" : "Disconnected"),
            ("Environment", snapshot?.environment ?? "—"),
            ("Phone app", snapshot?.phoneVersion ?? "—"),
            ("Watch app", Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"),
            ("Protocol", "Watch v1 / phone \(repository.remoteProtocolVersion.map(String.init) ?? "—")"),
            ("Data age", snapshot?.navigation.sourceAt.map { "\(Int(max(0, now - $0) / 1_000)) s" } ?? "—"),
            ("Publisher", snapshot.map { String($0.publisherId.prefix(12)) } ?? "—"),
            ("Session", snapshot?.sessionId.map { String($0.prefix(12)) } ?? "—"),
            ("Maneuver", snapshot?.navigation.maneuver?.id ?? "—"),
            ("Route revision", snapshot.map { String($0.navigation.routeRevision) } ?? "—"),
            ("Revision", snapshot.map { String($0.revision) } ?? "—"),
            ("Received / dropped", "\(repository.received) / \(repository.dropped)"),
            ("Last error", repository.lastError), ("Ping", repository.pingStatus),
            ("Haptics", snapshot?.hapticsEnabled == false ? "Off on phone" : repository.hapticStatus)
        ]
    }
    var body: some View {
        ForEach(rows, id: \.0) { row in
            VStack(alignment: .leading, spacing: 3) {
                Text(row.0).font(WatchDesign.sans(12)).foregroundStyle(WatchDesign.muted)
                Text(row.1).font(WatchDesign.mono(12))
            }.frame(maxWidth: .infinity, alignment: .leading).padding(10)
                .background(WatchDesign.card, in: RoundedRectangle(cornerRadius: 14))
        }
        Button("Retry / ping phone") { repository.refresh(request: true) }
        Text("Recent diagnostics").foregroundStyle(WatchDesign.muted)
        ForEach(Array(repository.history.suffix(8).reversed().enumerated()), id: \.offset) { _, event in
            Text(event).font(WatchDesign.sans(12)).foregroundStyle(WatchDesign.muted)
        }
    }
}

struct HapticsPage: View {
    @EnvironmentObject private var repository: WatchRepository
    @Environment(\.isLuminanceReduced) private var ambient
    var body: some View {
        if !ambient {
            pattern("left", title: "Left", detail: "One short tap")
            pattern("right", title: "Right", detail: "Two short taps")
            pattern("neutral", title: "Roundabout", detail: "Longer cue · also U-turn")
            pattern("camera", title: "Camera", detail: "Three quick taps")
            Text(repository.snapshot?.hapticsEnabled == false ? "Haptics off on phone" : "Turn haptics off in the phone app")
                .font(WatchDesign.sans(12)).foregroundStyle(WatchDesign.muted).multilineTextAlignment(.leading)
            Text(repository.hapticStatus).font(WatchDesign.sans(12)).foregroundStyle(WatchDesign.muted)
        }
    }
    private func pattern(_ value: String, title: String, detail: String) -> some View {
        Button { repository.preview(value) } label: {
            HStack(spacing: 10) {
                if value == "camera" { Image(systemName: "video.fill").foregroundStyle(WatchDesign.alert) }
                else { ManeuverGlyph(kind: value == "neutral" ? "roundabout" : value, size: 28) }
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(WatchDesign.sans(16))
                    Text(detail).font(WatchDesign.sans(12)).foregroundStyle(WatchDesign.muted)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12).padding(.vertical, 10).frame(minHeight: 56)
        }.buttonStyle(WatchCardButtonStyle()).accessibilityHint("Play pattern on your wrist")
    }
}
