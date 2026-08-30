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

    context.translateBy(x: 0, y: CGFloat(image.height))
    context.scaleBy(x: 1, y: -1)
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

guard CommandLine.arguments.count == 2 else {
    fail(
        "Usage: android-auto-ocr.swift <screenshot.png> | --mean-luminance <screenshot.png> <x> <y> <width> <height> | --mean-pixel-difference <first.png> <second.png> <x> <y> <width> <height>"
    )
}

let image = loadImage(at: CommandLine.arguments[1])

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
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
        print(candidate.string)
    }
}
