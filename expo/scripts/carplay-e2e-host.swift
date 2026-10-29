import AppKit
import ApplicationServices
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("\(message)\n".utf8))
    exit(1)
}

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    AXUIElementCopyAttributeValue(element, name as CFString, &value)
    return value
}

func elements(_ root: AXUIElement, depth: Int = 0) -> [AXUIElement] {
    if depth > 12 { return [] }
    return [root]
        + (attribute(root, "AXChildren") as? [AXUIElement] ?? []).flatMap {
            elements($0, depth: depth + 1)
        }
}

func frame(_ element: AXUIElement) -> CGRect {
    guard let position = attribute(element, "AXPosition"), let size = attribute(element, "AXSize")
    else { fail("Missing CarPlay frame") }
    var origin = CGPoint.zero
    var dimensions = CGSize.zero
    AXValueGetValue(position as! AXValue, .cgPoint, &origin)
    AXValueGetValue(size as! AXValue, .cgSize, &dimensions)
    return CGRect(origin: origin, size: dimensions)
}

let arguments = CommandLine.arguments
guard arguments.count >= 2 else {
    fail(
        "Usage: carplay-e2e-host check | geometry | tap <x> <y> | drag <x1> <y1> <x2> <y2> | tap-sequence <x1> <y1> ... | back | home"
    )
}
guard AXIsProcessTrusted() else {
    fail(
        "Allow the app running npm (IDE or terminal) in System Settings > Privacy & Security > Device Control and Data Access (Accessibility), then restart that app"
    )
}
guard
    let app = NSRunningApplication.runningApplications(
        withBundleIdentifier: "com.apple.CarPlaySimulator"
    ).first
else {
    fail("Open CarPlay Simulator and connect the iPhone before running this suite")
}
let application = AXUIElementCreateApplication(app.processIdentifier)
let windows = attribute(application, "AXWindows") as? [AXUIElement] ?? []
// Auxiliary navigation windows belong to the same app; only the session has the camera toolbar action.
func screenshotButton(_ root: AXUIElement) -> AXUIElement? {
    elements(root).first { attribute($0, "AXHelp") as? String == "Take Screenshot" }
}
let sessions = windows.filter { screenshotButton($0) != nil }
guard sessions.count == 1, let window = sessions.first else {
    fail("Expected one CarPlay session with a screenshot toolbar action")
}
let bounds = frame(window)
if arguments[1] == "check" && arguments.count == 2 {
    print("ready")
} else if arguments[1] == "geometry" && arguments.count == 2 {
    guard
        let toolbar = elements(window).first(where: {
            attribute($0, "AXRole") as? String == "AXToolbar"
        })
    else { fail("Missing CarPlay toolbar") }
    let result: [String: Any] = [
        "windowWidth": bounds.width, "windowHeight": bounds.height,
        "toolbarHeight": frame(toolbar).height, "displayInset": 10,
    ]
    print(String(data: try JSONSerialization.data(withJSONObject: result), encoding: .utf8)!)
} else if ["tap", "drag", "tap-sequence", "back", "home"].contains(arguments[1]) {
    let originalCursor = CGEvent(source: nil)?.location
    let originalForeground = NSWorkspace.shared.frontmostApplication?.processIdentifier
    defer {
        let cursorUnchanged = CGEvent(source: nil)?.location == originalCursor
        let foregroundUnchanged =
            NSWorkspace.shared.frontmostApplication?.processIdentifier == originalForeground
        print(
            "background-input cursorUnchanged=\(cursorUnchanged) foregroundUnchanged=\(foregroundUnchanged)"
        )
    }
    let inputBounds = frame(window)
    let matchingWindows =
        (CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID)
        as? [[String: Any]] ?? []).filter {
            ($0[kCGWindowOwnerPID as String] as? Int32) == app.processIdentifier
                && ($0[kCGWindowLayer as String] as? Int) == 0
        }
    guard
        let windowInfo = matchingWindows.first(where: {
            guard let value = $0[kCGWindowBounds as String] as? [String: Any],
                let candidate = CGRect(dictionaryRepresentation: value as CFDictionary)
            else { return false }
            return abs(candidate.minX - inputBounds.minX) < 2
                && abs(candidate.minY - inputBounds.minY) < 2
                && abs(candidate.width - inputBounds.width) < 2
                && abs(candidate.height - inputBounds.height) < 2
        }), let windowNumber = windowInfo[kCGWindowNumber as String] as? Int64
    else { fail("Could not identify the CarPlay session window number") }
    // AppKit needs both screen and window-local positions for background input.
    // This private macOS symbol stays confined to the simulator test utility.
    typealias SetWindowLocation = @convention(c) (CGEvent, CGPoint) -> Void
    guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGEventSetWindowLocation")
    else {
        fail(
            "This macOS version cannot route background window input; refusing desktop cursor fallback")
    }
    let setWindowLocation = unsafeBitCast(symbol, to: SetWindowLocation.self)
    func point(_ start: Int) -> CGPoint {
        guard arguments.count > start + 1,
            let x = Double(arguments[start]), let y = Double(arguments[start + 1]),
            x >= 0, x <= 1, y >= 0, y <= 1
        else { fail("Invalid relative coordinates") }
        return CGPoint(
            x: inputBounds.minX + x * inputBounds.width, y: inputBounds.minY + y * inputBounds.height)
    }
    func mouse(_ type: CGEventType, _ point: CGPoint, delta: CGPoint = .zero) {
        let local = CGPoint(x: point.x - inputBounds.minX, y: inputBounds.maxY - point.y)
        guard let eventType = NSEvent.EventType(rawValue: UInt(type.rawValue)),
            let event = NSEvent.mouseEvent(
                with: eventType, location: local, modifierFlags: app.isActive ? [] : [.command],
                timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: Int(windowNumber),
                context: nil, eventNumber: 1, clickCount: 1, pressure: type == .leftMouseUp ? 0 : 1)?
                .cgEvent
        else { fail("Could not create CarPlay window input") }
        event.location = point
        setWindowLocation(event, CGPoint(x: point.x - inputBounds.minX, y: point.y - inputBounds.minY))
        event.setIntegerValueField(.mouseEventSubtype, value: 3)
        event.setIntegerValueField(.mouseEventClickState, value: 1)
        event.setIntegerValueField(.mouseEventDeltaX, value: Int64(delta.x.rounded()))
        event.setIntegerValueField(.mouseEventDeltaY, value: Int64(delta.y.rounded()))
        event.setIntegerValueField(.mouseEventWindowUnderMousePointer, value: windowNumber)
        event.setIntegerValueField(
            .mouseEventWindowUnderMousePointerThatCanHandleThisEvent, value: windowNumber)
        event.postToPid(app.processIdentifier)
    }
    if arguments[1] == "tap" && arguments.count == 4 {
        let target = point(2)
        Thread.sleep(forTimeInterval: 0.15)
        mouse(.leftMouseDown, target)
        Thread.sleep(forTimeInterval: 0.2)
        mouse(.leftMouseUp, target)
        print("x=\(target.x), y=\(target.y), window=\(inputBounds)")
    } else if arguments[1] == "drag" && arguments.count == 6 {
        let start = point(2)
        let end = point(4)
        Thread.sleep(forTimeInterval: 0.15)
        mouse(.leftMouseDown, start)
        var previous = start
        for index in 1...24 {
            let fraction = Double(index) / 24
            let target = CGPoint(
                x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction)
            mouse(
                .leftMouseDragged, target,
                delta: CGPoint(x: target.x - previous.x, y: target.y - previous.y))
            previous = target
            Thread.sleep(forTimeInterval: 0.025)
        }
        mouse(.leftMouseUp, end)
        print("dragged")
    } else if arguments[1] == "tap-sequence" && arguments.count >= 4 && (arguments.count - 2) % 2 == 0
    {
        for start in stride(from: 2, to: arguments.count, by: 2) {
            let target = point(start)
            mouse(.leftMouseDown, target)
            Thread.sleep(forTimeInterval: 0.08)
            mouse(.leftMouseUp, target)
            Thread.sleep(forTimeInterval: 0.12)
        }
        print("key sequence tapped")
    } else if ["back", "home"].contains(arguments[1]) && arguments.count == 2 {
        let identifier = arguments[1] == "home" ? "house" : "arrow.uturn.backward"
        guard
            let button = elements(window).first(where: {
                attribute($0, "AXIdentifier") as? String == identifier
            }),
            AXUIElementPerformAction(button, kAXPressAction as CFString) == .success
        else { fail("Missing CarPlay \(arguments[1]) control") }
        print("\(arguments[1]) pressed")
    } else {
        fail("Invalid input command")
    }
    Thread.sleep(forTimeInterval: 0.15)

} else {
    fail("Unsupported CarPlay host command")
}
