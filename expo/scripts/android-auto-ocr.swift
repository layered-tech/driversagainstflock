#!/usr/bin/env swift

import Foundation
import CoreGraphics
import ImageIO
import Vision

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("\(message)\n".utf8))
    exit(1)
}

func loadImage(at path: String) -> CGImage {
    let screenshotURL = URL(fileURLWithPath: path)

    guard
        let imageSource = CGImageSourceCreateWithURL(screenshotURL as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(imageSource, 0, nil)
    else {
        fail("Could not read screenshot: \(screenshotURL.path)")
    }

    return image
}

func decodePixels(_ image: CGImage) -> ([UInt8], Int) {
    let bytesPerPixel = 4
    let bytesPerRow = image.width * bytesPerPixel
    var pixels = [UInt8](
        repeating: 0,
        count: image.height * bytesPerRow
    )
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGBitmapInfo(
        rawValue: CGImageAlphaInfo.premultipliedLast.rawValue
    )

    guard
        let context = CGContext(
            data: &pixels,
            width: image.width,
            height: image.height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: bitmapInfo.rawValue
        )
    else {
        fail("Could not decode screenshot pixels")
    }

    context.draw(
        image,
        in: CGRect(x: 0, y: 0, width: image.width, height: image.height)
    )

    return (pixels, bytesPerRow)
}

func parseCrop(_ values: ArraySlice<String>, image: CGImage) -> [Int] {
    let cropValues = values.map { Int($0) }

    guard cropValues.count == 4, cropValues.allSatisfy({ $0 != nil }) else {
        fail("Crop coordinates must be four integers")
    }

    let parsed = cropValues.map { $0! }
    let x = parsed[0]
    let y = parsed[1]
    let width = parsed[2]
    let height = parsed[3]

    guard
        x >= 0,
        y >= 0,
        width > 0,
        height > 0,
        x + width <= image.width,
        y + height <= image.height
    else {
        fail("Crop is outside the \(image.width)x\(image.height) screenshot")
    }

    return parsed
}

if CommandLine.arguments.count == 3, CommandLine.arguments[1] == "--host-layout" {
    let image = loadImage(at: CommandLine.arguments[2])
    let crop = parseCrop(["24", String(image.height - 64), "32", "36"][...], image: image)
    let (pixels, stride) = decodePixels(image)
    let width = crop[2], height = crop[3]
    var visited = Set<Int>()
    var gridDots = 0, dashboardButtons = 0
    func isWhite(_ x: Int, _ y: Int) -> Bool {
        let offset = (crop[1] + y) * stride + (crop[0] + x) * 4
        let r = Int(pixels[offset]), g = Int(pixels[offset + 1]), b = Int(pixels[offset + 2])
        return min(r, min(g, b)) > 200 && max(r, max(g, b)) - min(r, min(g, b)) < 30
    }
    for y in 0..<height {
        for x in 0..<width {
            let seed = y * width + x
            if visited.contains(seed) || !isWhite(x, y) { continue }
            var queue = [seed], cursor = 0
            var minX = x, maxX = x, minY = y, maxY = y
            visited.insert(seed)
            while cursor < queue.count {
                let point = queue[cursor], px = point % width, py = point / width
                cursor += 1
                minX = min(minX, px); maxX = max(maxX, px)
                minY = min(minY, py); maxY = max(maxY, py)
                for (dx, dy) in [(0, 1), (0, -1), (1, 0), (-1, 0)] {
                    let nx = px + dx, ny = py + dy
                    if nx < 0 || ny < 0 || nx >= width || ny >= height { continue }
                    let next = ny * width + nx
                    if !visited.contains(next) && isWhite(nx, ny) {
                        visited.insert(next); queue.append(next)
                    }
                }
            }
            let componentWidth = maxX - minX + 1, componentHeight = maxY - minY + 1
            if queue.count >= 6 && componentWidth <= 8 && componentHeight <= 8 { gridDots += 1 }
            if queue.count >= 80 && componentWidth >= 20 && componentHeight >= 20 { dashboardButtons += 1 }
        }
    }
    // The host shows the app-launcher grid in Dashboard and the two-pane Dashboard button in Fullscreen.
    let layout = gridDots == 9 && dashboardButtons == 0 ? "dashboard" :
        dashboardButtons == 1 && gridDots == 0 ? "fullscreen" : "unknown"
    let result: [String: Any] = ["layout": layout, "gridDots": gridDots, "dashboardButtons": dashboardButtons]
    let data = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
    exit(0)
}

if CommandLine.arguments.count == 7, CommandLine.arguments[1] == "--puck-pixels" {
    let image = loadImage(at: CommandLine.arguments[2])
    let crop = parseCrop(CommandLine.arguments[3...6], image: image)
    let (pixels, stride) = decodePixels(image)
    let width = crop[2], height = crop[3]
    var visited = Set<Int>()
    var proof: [String: Any] = ["visible": false, "bluePixels": 0, "outlinePixels": 0]
    func rgb(_ x: Int, _ y: Int) -> (Int, Int, Int) {
        let offset = (crop[1] + y) * stride + (crop[0] + x) * 4
        return (Int(pixels[offset]), Int(pixels[offset + 1]), Int(pixels[offset + 2]))
    }
    func isBlue(_ x: Int, _ y: Int) -> Bool {
        let (red, green, blue) = rgb(x, y)
        return blue > 100 && blue - red > 35 && blue - green > 12
    }
    for y in 0..<height {
        for x in 0..<width {
            let seed = y * width + x
            if visited.contains(seed) || !isBlue(x, y) { continue }
            var queue = [seed], cursor = 0
            visited.insert(seed)
            var minX = x, maxX = x, minY = y, maxY = y
            var outline = Set<Int>()
            while cursor < queue.count {
                let point = queue[cursor], px = point % width, py = point / width
                cursor += 1
                minX = min(minX, px); maxX = max(maxX, px)
                minY = min(minY, py); maxY = max(maxY, py)
                for dy in -2...2 {
                    for dx in -2...2 {
                        let nx = px + dx, ny = py + dy
                        if nx < 0 || ny < 0 || nx >= width || ny >= height { continue }
                        let (r, g, b) = rgb(nx, ny)
                        if min(r, min(g, b)) > 235 { outline.insert(ny * width + nx) }
                        if abs(dx) + abs(dy) == 1 && isBlue(nx, ny) && !visited.contains(ny * width + nx) {
                            visited.insert(ny * width + nx)
                            queue.append(ny * width + nx)
                        }
                    }
                }
            }
            // The default puck has a substantial blue body with a white outline.
            // Thin route lines and blue water touching the crop edge are not puck evidence.
            let filledFraction = Double(queue.count) / Double((maxX - minX + 1) * (maxY - minY + 1))
            if queue.count >= 80 && maxX - minX >= 18 && maxY - minY >= 15 &&
                maxX - minX <= 100 && maxY - minY <= 80 && outline.count >= 150 &&
                filledFraction < 0.65 &&
                minX > 0 && minY > 0 && maxX < width - 1 && maxY < height - 1 {
                proof = ["visible": true, "bluePixels": queue.count, "outlinePixels": outline.count,
                         "bounds": [crop[0] + minX, crop[1] + minY, maxX - minX + 1, maxY - minY + 1]]
                break
            }
        }
        if proof["visible"] as? Bool == true { break }
    }
    let data = try! JSONSerialization.data(withJSONObject: proof, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
    exit(0)
}

if CommandLine.arguments.count == 7, CommandLine.arguments[1] == "--mean-luminance" {
    let image = loadImage(at: CommandLine.arguments[2])
    let values = parseCrop(CommandLine.arguments[3...6], image: image)
    let x = values[0]
    let y = values[1]
    let width = values[2]
    let height = values[3]
    let (pixels, bytesPerRow) = decodePixels(image)
    let bytesPerPixel = 4

    var luminanceTotal = 0.0

    for row in y..<(y + height) {
        for column in x..<(x + width) {
            let offset = row * bytesPerRow + column * bytesPerPixel
            let red = Double(pixels[offset]) / 255.0
            let green = Double(pixels[offset + 1]) / 255.0
            let blue = Double(pixels[offset + 2]) / 255.0
            luminanceTotal += 0.2126 * red + 0.7152 * green + 0.0722 * blue
        }
    }

    let meanLuminance = luminanceTotal / Double(width * height)
    print(String(format: "%.6f", meanLuminance))
    exit(0)
}

if CommandLine.arguments.count == 8,
    CommandLine.arguments[1] == "--mean-pixel-difference"
{
    let firstImage = loadImage(at: CommandLine.arguments[2])
    let secondImage = loadImage(at: CommandLine.arguments[3])

    guard
        firstImage.width == secondImage.width,
        firstImage.height == secondImage.height
    else {
        fail("Screenshots must have matching dimensions")
    }

    let values = parseCrop(CommandLine.arguments[4...7], image: firstImage)
    let x = values[0]
    let y = values[1]
    let width = values[2]
    let height = values[3]
    let (firstPixels, firstBytesPerRow) = decodePixels(firstImage)
    let (secondPixels, secondBytesPerRow) = decodePixels(secondImage)
    let bytesPerPixel = 4
    var differenceTotal = 0.0

    for row in y..<(y + height) {
        for column in x..<(x + width) {
            let firstOffset = row * firstBytesPerRow + column * bytesPerPixel
            let secondOffset = row * secondBytesPerRow + column * bytesPerPixel

            for channel in 0..<3 {
                differenceTotal += abs(
                    Double(firstPixels[firstOffset + channel])
                        - Double(secondPixels[secondOffset + channel])
                ) / 255.0
            }
        }
    }

    let meanDifference = differenceTotal / Double(width * height * 3)
    print(String(format: "%.6f", meanDifference))
    exit(0)
}

let findsTextBounds = CommandLine.arguments.count == 4 && CommandLine.arguments[1] == "--text-bounds"

guard CommandLine.arguments.count == 2 || findsTextBounds else {
    fail(
        "Usage: android-auto-ocr.swift <screenshot.png> | --mean-luminance <screenshot.png> <x> <y> <width> <height> | --mean-pixel-difference <first.png> <second.png> <x> <y> <width> <height>"
    )
}

let image = loadImage(at: CommandLine.arguments[findsTextBounds ? 2 : 1])

let request = VNRecognizeTextRequest()
request.recognitionLevel = .fast
request.usesLanguageCorrection = true
request.recognitionLanguages = ["en-US"]

do {
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
} catch {
    fail("Vision OCR failed: \(error.localizedDescription)")
}

let observations = (request.results ?? []).sorted { first, second in
    let verticalDifference = first.boundingBox.midY - second.boundingBox.midY

    if abs(verticalDifference) > 0.02 {
        return verticalDifference > 0
    }

    return first.boundingBox.minX < second.boundingBox.minX
}

for observation in observations {
    if let candidate = observation.topCandidates(1).first {
        if findsTextBounds {
            if candidate.string.localizedCaseInsensitiveContains(CommandLine.arguments[3]) {
                let bounds = observation.boundingBox
                let result: [String: Any] = ["text": candidate.string,
                    "x": Int(bounds.midX * Double(image.width)),
                    "y": Int((1 - bounds.midY) * Double(image.height))]
                let data = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
                print(String(data: data, encoding: .utf8)!)
                exit(0)
            }
            continue
        }
        print(candidate.string)
    }
}
if findsTextBounds { fail("Text was not found in screenshot: \(CommandLine.arguments[3])") }
