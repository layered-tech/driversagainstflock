import ExpoModulesCore
import Foundation
import UIKit
import UniformTypeIdentifiers

private let maximumBackupBytes = 5 * 1024 * 1024

private enum ScorecardBackupPickerOperation {
  case exporting(temporaryDirectory: URL)
  case importing
}

private struct ScorecardBackupPickerContext {
  let delegate: ScorecardBackupPickerDelegate
  let operation: ScorecardBackupPickerOperation
  let promise: Promise
}

private final class ScorecardBackupPickerDelegate: NSObject,
  UIDocumentPickerDelegate,
  UIAdaptivePresentationControllerDelegate
{
  private let onCancel: () -> Void
  private let onPick: ([URL]) -> Void

  init(onPick: @escaping ([URL]) -> Void, onCancel: @escaping () -> Void) {
    self.onPick = onPick
    self.onCancel = onCancel
  }

  func documentPicker(
    _ controller: UIDocumentPickerViewController,
    didPickDocumentsAt urls: [URL]
  ) {
    onPick(urls)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    onCancel()
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    onCancel()
  }
}

public final class ScorecardBackupFileModule: Module {
  private var pickerContext: ScorecardBackupPickerContext?

  public func definition() -> ModuleDefinition {
    Name("ScorecardBackupFile")

    AsyncFunction("exportBackup") {
      (contents: String, suggestedFilename: String, promise: Promise) in
      self.presentExportPicker(
        contents: contents,
        suggestedFilename: suggestedFilename,
        promise: promise
      )
    }.runOnQueue(.main)

    AsyncFunction("importBackup") { (promise: Promise) in
      self.presentImportPicker(promise: promise)
    }.runOnQueue(.main)
  }

  private func presentExportPicker(
    contents: String,
    suggestedFilename: String,
    promise: Promise
  ) {
    guard contents.lengthOfBytes(using: .utf8) <= maximumBackupBytes else {
      promise.reject("ERR_SCORECARD_BACKUP_TOO_LARGE", "The scorecard backup is too large to export.")
      return
    }

    do {
      let temporaryDirectory = FileManager.default.temporaryDirectory
        .appendingPathComponent("daf-scorecard-backup-\(UUID().uuidString)", isDirectory: true)
      let fileURL = temporaryDirectory.appendingPathComponent(
        sanitizeFilename(suggestedFilename),
        isDirectory: false
      )

      try FileManager.default.createDirectory(
        at: temporaryDirectory,
        withIntermediateDirectories: true
      )
      try contents.write(to: fileURL, atomically: true, encoding: .utf8)

      let picker = UIDocumentPickerViewController(forExporting: [fileURL], asCopy: true)
      present(
        picker: picker,
        operation: .exporting(temporaryDirectory: temporaryDirectory),
        promise: promise
      )
    } catch {
      promise.reject(
        "ERR_SCORECARD_BACKUP_EXPORT",
        "The scorecard backup file could not be prepared."
      )
    }
  }

  private func presentImportPicker(promise: Promise) {
    let picker = UIDocumentPickerViewController(
      forOpeningContentTypes: [.json, .plainText, .data],
      asCopy: true
    )

    present(picker: picker, operation: .importing, promise: promise)
  }

  private func present(
    picker: UIDocumentPickerViewController,
    operation: ScorecardBackupPickerOperation,
    promise: Promise
  ) {
    guard pickerContext == nil else {
      removeTemporaryDirectory(for: operation)
      promise.reject(
        "ERR_SCORECARD_BACKUP_IN_PROGRESS",
        "A scorecard backup file picker is already open."
      )
      return
    }

    guard let viewController = appContext?.utilities?.currentViewController() else {
      removeTemporaryDirectory(for: operation)
      promise.reject(
        "ERR_SCORECARD_BACKUP_VIEW_CONTROLLER",
        "The scorecard backup file picker is unavailable."
      )
      return
    }

    let delegate = ScorecardBackupPickerDelegate(
      onPick: { [weak self] urls in
        self?.handlePickedDocuments(urls)
      },
      onCancel: { [weak self] in
        self?.finishPicker { context in
          switch context.operation {
          case .exporting:
            context.promise.resolve(false)
          case .importing:
            context.promise.resolve(nil)
          }
        }
      }
    )

    pickerContext = ScorecardBackupPickerContext(
      delegate: delegate,
      operation: operation,
      promise: promise
    )
    picker.delegate = delegate
    picker.presentationController?.delegate = delegate

    if UIDevice.current.userInterfaceIdiom == .pad {
      let viewFrame = viewController.view.frame
      picker.popoverPresentationController?.sourceRect = CGRect(
        x: viewFrame.midX,
        y: viewFrame.maxY,
        width: 0,
        height: 0
      )
      picker.popoverPresentationController?.sourceView = viewController.view
      picker.modalPresentationStyle = .pageSheet
    }

    viewController.present(picker, animated: true)
  }

  private func handlePickedDocuments(_ urls: [URL]) {
    guard let context = pickerContext else {
      return
    }

    switch context.operation {
    case .exporting:
      finishPicker { pickerContext in
        pickerContext.promise.resolve(true)
      }
    case .importing:
      guard let url = urls.first else {
        finishPicker { pickerContext in
          pickerContext.promise.resolve(nil)
        }
        return
      }

      do {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        let reportedSize = (attributes[.size] as? NSNumber)?.intValue

        if let reportedSize {
          guard reportedSize <= maximumBackupBytes else {
            throw ScorecardBackupFileError.tooLarge
          }
        }

        let data = try Data(contentsOf: url, options: [.mappedIfSafe])

        guard data.count <= maximumBackupBytes else {
          throw ScorecardBackupFileError.tooLarge
        }

        guard let contents = String(data: data, encoding: .utf8) else {
          throw ScorecardBackupFileError.invalidText
        }

        finishPicker { pickerContext in
          pickerContext.promise.resolve(contents)
        }
      } catch ScorecardBackupFileError.tooLarge {
        finishPicker { pickerContext in
          pickerContext.promise.reject(
            "ERR_SCORECARD_BACKUP_TOO_LARGE",
            "The selected scorecard backup is too large to import."
          )
        }
      } catch {
        finishPicker { pickerContext in
          pickerContext.promise.reject(
            "ERR_SCORECARD_BACKUP_IMPORT",
            "The selected scorecard backup file could not be read."
          )
        }
      }
    }
  }

  private func finishPicker(
    _ completion: (ScorecardBackupPickerContext) -> Void
  ) {
    guard let context = pickerContext else {
      return
    }

    pickerContext = nil

    removeTemporaryDirectory(for: context.operation)

    completion(context)
  }

  private func removeTemporaryDirectory(for operation: ScorecardBackupPickerOperation) {
    if case let .exporting(temporaryDirectory) = operation {
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }
  }

  private func sanitizeFilename(_ suggestedFilename: String) -> String {
    let lastPathComponent = URL(fileURLWithPath: suggestedFilename).lastPathComponent
    let allowedCharacters = CharacterSet.alphanumerics.union(
      CharacterSet(charactersIn: "-_.")
    )
    let sanitized = lastPathComponent.unicodeScalars
      .map { allowedCharacters.contains($0) ? String($0) : "-" }
      .joined()
      .prefix(120)
    let filename = sanitized.isEmpty ? "daf-scorecard-backup.json" : String(sanitized)

    return filename.lowercased().hasSuffix(".json") ? filename : "\(filename).json"
  }
}

private enum ScorecardBackupFileError: Error {
  case invalidText
  case tooLarge
}
