#!/usr/bin/env swift

import Foundation
import ImageIO
import Vision

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("\(message)\n".utf8))
    exit(1)
}

guard CommandLine.arguments.count == 2 else {
    fail("Usage: android-auto-ocr.swift <screenshot.png>")
}

let screenshotURL = URL(fileURLWithPath: CommandLine.arguments[1])

guard
    let imageSource = CGImageSourceCreateWithURL(screenshotURL as CFURL, nil),
    let image = CGImageSourceCreateImageAtIndex(imageSource, 0, nil)
else {
    fail("Could not read screenshot: \(screenshotURL.path)")
}

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
