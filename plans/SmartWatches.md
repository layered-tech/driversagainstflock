# Watch companion rollout: Wear OS first, Apple Watch ready

## Summary

Start with a private Wear OS PoC on Galaxy Watch8 showing **live navigation and an active-drive Scorecard**. Establish reliable state delivery and diagnostics before adding haptics, camera alerts, and My areas.

The eventual companion covers every proposed use case except camera contribution. The phone owns route selection, navigation calculations, Scorecard tracking, and Area subscriptions.

## Required designs — complete before application implementation begins

Complete this design package before coding begins. Keep the deliverables together, organized by phase, with annotated states, interaction flows, reusable components, and platform-specific variants.

**Shared design foundations**

- Wear OS round-screen layouts and Apple Watch rectangular layouts.
- Typography, colors, spacing, icons, touch targets, text truncation, and accessibility behavior.
- Reusable maneuver indicator, distance display, trip summary, metric tile, status indicator, notification card, and phone-handoff action.
- Loading, unavailable, disconnected, stale, and incompatible-version treatments.
- Screen hierarchy and navigation flows for active routed navigation versus idle use.
- Ambient/reduced-update presentation and return-to-active behavior.
- Haptic vocabulary and timing annotations, keeping semantic meanings consistent across platforms.

**Phase 1 — Navigation and Scorecard PoC**

- **Idle screen:** “Start a Route” with “On your phone” beneath it.
- **Active navigation screen:** maneuver symbol, instruction, distance to maneuver, destination, ETA, remaining duration, and remaining distance.
- **Maneuver variants:** left/right, slight/sharp turns, keep-left/right, straight, roundabout with exit number, U-turn, departure, and arrival.
- **Navigation state variants:** waiting for location, rerouting, missing maneuver, route ended, connecting, disconnected, stale updates, and incompatible companion.
- **Active Scorecard screen:** elapsed time, distance traveled, and camera-crossing counts using the phone’s existing definitions.
- **Scorecard state variants:** tracking off, initializing, temporarily unavailable, and no active routed drive.
- **Diagnostics screen:** connection and version information, data age, session/maneuver identity, revisions, counters, errors, and ping results.
- **Interaction flow:** switching between navigation, Scorecard, and diagnostics; returning to idle after a route ends.
- No route controls or phone-handoff button in this phase.

**Phase 2 — Maneuver haptics**

- **Haptic explanation/preview screen:** one short tap for left, two for right, and one longer neutral pulse for roundabouts/U-turns.
- **Phone companion settings:** maneuver-haptics toggle and access to pattern previews.
- **Annotated maneuver sequences:** when the advance cue occurs, visual state at cue time, and progression after the maneuver.
- **Behavior states:** haptics disabled, system-suppressed, disconnected, stale, rerouting, and unsupported capability.
- **Background navigation surface:** Wear OS ongoing-activity indicator and return-to-guidance flow.
- Specify cue priority and suppression behavior for closely spaced maneuvers.

**Phase 3 — Upcoming camera alerts**

- **Camera alert presentation:** camera type when known, road name, distance, and distinct haptic meaning.
- **Alert state variants:** new alert, multiple eligible cameras, dismissed/expired alert, and interrupted delivery.
- **Navigation coexistence:** how camera information appears without obscuring maneuver guidance.
- **Phone companion settings:** wrist camera-alert toggle and whether alerts accompany car audio.
- **Notification presentation:** collapsed and expanded states where supported.
- **Annotated priority flows:** maneuver cue takes precedence; obsolete camera cues expire instead of playing late.

**Phase 4 — My areas**

- **Idle home/My areas list:** watched Area names, unread counts, and recent activity summaries.
- **Area summary screen:** recent camera additions/removals with concise location and time information.
- **Change summary screen:** enough context to understand the update, with “Open on phone” for detail.
- **Area notification:** individual change and digest presentations.
- **Phone-handoff states:** initiating, successful, phone unavailable, and failed.
- **Empty/error states:** no watched Areas, no changes, loading, offline/cached content, and expired phone subscription session.
- **Navigation flow:** idle My areas home → Area → change → phone detail; active route takes the navigation presentation.
- Area creation, boundary editing, and detailed map inspection remain on the phone.

**Phase 5 — Scorecard recap and quick access**

- **Completed-drive recap:** duration, distance, camera crossings, finalized avoided-camera totals, earned XP, and privacy-score results.
- **Recap variants:** completed drive, canceled route, unavailable metrics, and tracking disabled.
- **Recap handoff:** open the corresponding Scorecard detail on the phone.
- **Wear OS tile:** Area unread summary and shortcuts to the appropriate app screen.
- **Complications:** unread Area count and companion shortcut, with supported size variants.
- **Quick-access states:** no unread changes, active route, stale content, and unavailable phone.
- Define how arrival transitions into recap and then back to the idle My areas experience.

**Phase 6 — Apple Watch**

- **SwiftUI equivalents:** navigation, active Scorecard, diagnostics, My areas, change summary, recap, and settings/preview flows.
- **Apple-specific notification presentations** and phone-handoff states.
- **Complication and Smart Stack widget layouts** for the selected supported families.
- **Crown scrolling, back navigation, accessibility, and Always On presentations.**
- **WatchConnectivity states:** reachable, temporarily unreachable, cached/stale content, and companion unavailable.
- **Apple haptic mapping:** preserve directional/neutral meanings using supported native feedback; annotate differences from Wear OS.
- **Cross-platform comparison sheet:** identify intentional layout, interaction, lifecycle, and haptic differences.

Design handoff must include screen/state coverage, interaction annotations, assets/tokens, and haptic specifications. Device findings must be reflected in the affected designs before that phase proceeds.

## Architecture and shared contracts

- Add a native Kotlin/Compose watch app under **`./wear-os` at the project root**, outside Expo’s generated Android directory. Connect it through a local Expo native module.
- Initialize the phone publisher alongside existing shared runtimes, independent of the visible map screen.
- Reuse accepted locations, route-progress helpers, rerouting state, and Scorecard calculations.
- Define platform-neutral navigation, Scorecard, connection-status, and diagnostic snapshots containing protocol version, publisher/session identity, revision, source timestamps, and unavailable states.
- Represent maneuvers semantically rather than embedding Android icons or vibration waveforms in shared data.
- Use Wear OS Data Layer for Android transport. Keep latest-state synchronization separate from short-lived events so reconnecting never replays expired cues.
- Later, add SwiftUI and WatchConnectivity adapters consuming the same contracts and shared contract fixtures.

No backend changes, watch login, independent watch GPS, or standalone routing are needed for the PoC.

## Phased implementation

| Phase | Deliverable | Exit gate |
|---|---|---|
| **1 — Visual PoC** | Display-only navigation, active Scorecard, explicit idle/connection states, and diagnostics. | Watch8 follows route progress, reroutes, reconnects, cancellation, and arrival; Scorecard agrees with the phone. |
| **2 — Maneuver haptics** | One advance cue per maneuver: one short tap left, two right, longer neutral pulse for roundabouts/U-turns. | Patterns are distinguishable, including with the screen off; no duplicate, expired, or previous-route cues. |
| **3 — Camera alerts** | Camera information, distinct haptic pattern, existing eligibility/suppression policies, and car-audio coordination preferences. | Correct road/route relevance, repeat suppression, stale-event rejection, and phone/car/watch coordination. |
| **4 — My areas** | Idle Area summaries, unread changes, notifications, and phone handoff for detail. | Correct summary/read-state synchronization, notification deduplication, and handoff. |
| **5 — Recap and quick access** | Finalized drive recaps, complications, and Wear OS tile. | Recaps match phone records; quick-access surfaces handle freshness and route to the correct screen. |
| **6 — Apple Watch** | Native Apple implementation of the established capabilities and contracts. | Simulator coverage plus physical Apple Watch validation before release. |

For Phase 1:

- Navigation shows maneuver/instruction/distance, destination, ETA, and remaining time/distance.
- Scorecard shows elapsed time, traveled distance, and crossing counts. Add a read-only runtime summary that preserves reroute accounting.
- Preserve Scorecard opt-out; never enable tracking from the watch.
- Publish state changes immediately and coalesce ordinary progress updates to at most once per second.
- Request current state on open/reconnect; reject older revisions and incompatible payloads.
- Mark guidance stale after 15 seconds without fresh source data. An old cached snapshot must not become fresh merely because it was received again.
- Diagnostics show versions/environment, connection, source-data age, session/maneuver identity, revisions, counters, errors, and ping round-trip time.
- Keep diagnostic history local and bounded; exclude credentials, raw coordinates, and complete route geometry.
- Use matching development package identities and signing certificates on phone and watch, as required by [Data Layer security](https://developer.android.com/training/wearables/data/overview).

For Phase 2:

- Initially cue 10 seconds before the maneuver based on current speed, bounded to 30–300 meters; use 100 meters when speed is unavailable.
- Centralize these testable constants for Watch8 tuning.
- Include slight/sharp turns and keep-left/right. Straight/departure steps remain visual-only.
- Maneuver cues take priority over camera haptics. Expire conflicting camera cues rather than replaying them late.
- Respect system interruption settings and validate the active-navigation background lifecycle using [Wear OS ongoing activities](https://developer.android.com/training/wearables/notifications/ongoing-activity).

## Validation and rollout

- **Automated:** Test snapshot generation, preview versus active navigation, maneuver mapping, rerouting, arrival/cancellation, Scorecard opt-out, distance accounting, missing values, stale/out-of-order packets, and reconnects. Reuse contract fixtures across Kotlin and later Swift.
- **UI:** Verify round-screen layouts, long instructions, larger text, accessibility, ambient transitions, and every designed state.
- **Physical device:** Start with deterministic simulated routes, then test live operation, Bluetooth interruption, app restarts, phone locking, watch backgrounding, haptics, and battery impact.
- **Release sequence:** Private Watch8 PoC → private haptics/alerts testing → limited Wear OS beta → broader Wear OS release. Enable capabilities independently.
- **Apple readiness:** Review every contract addition for both platforms from Phase 1 onward. Wear OS results do not establish Apple background-delivery or haptic reliability.
- Native builds and installation remain separately requested execution steps under repository rules. Report static, simulator, and physical-device evidence separately.
