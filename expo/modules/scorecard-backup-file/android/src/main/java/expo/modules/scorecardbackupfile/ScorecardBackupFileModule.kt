package expo.modules.scorecardbackupfile

import android.content.Context
import android.net.Uri
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val MAX_BACKUP_BYTES = 5 * 1024 * 1024

class ScorecardBackupFileModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.AppContextLost()

    override fun definition() = ModuleDefinition {
        Name("ScorecardBackupFile")

        lateinit var documentPickerLauncher:
            AppContextActivityResultLauncher<BackupDocumentRequest, BackupDocumentResult>

        RegisterActivityContracts {
            documentPickerLauncher = registerForActivityResult(
                BackupDocumentContract(),
            )
        }

        AsyncFunction("exportBackup") Coroutine {
                contents: String,
                suggestedFilename: String,
            ->
            val contentBytes = contents.toByteArray(StandardCharsets.UTF_8)

            require(contentBytes.size <= MAX_BACKUP_BYTES) {
                "The scorecard backup is too large to export."
            }

            when (
                val result = documentPickerLauncher.launch(
                    BackupDocumentRequest(
                        BackupDocumentOperation.EXPORT,
                        sanitizeFilename(suggestedFilename),
                    ),
                )
            ) {
                is BackupDocumentResult.Cancelled -> false
                is BackupDocumentResult.Selected -> {
                    writeBackup(result.uri, contentBytes)
                    true
                }
            }
        }

        AsyncFunction("importBackup") Coroutine { ->
            when (
                val result = documentPickerLauncher.launch(
                    BackupDocumentRequest(BackupDocumentOperation.IMPORT),
                )
            ) {
                is BackupDocumentResult.Cancelled -> null
                is BackupDocumentResult.Selected -> readBackup(result.uri)
            }
        }
    }

    private fun sanitizeFilename(suggestedFilename: String): String {
        val sanitized = suggestedFilename
            .substringAfterLast('/')
            .substringAfterLast('\\')
            .replace(Regex("[^A-Za-z0-9._-]"), "-")
            .take(120)
            .ifBlank { "daf-scorecard-backup.json" }

        return if (sanitized.endsWith(".json", ignoreCase = true)) {
            sanitized
        } else {
            "$sanitized.json"
        }
    }

    private suspend fun writeBackup(uri: Uri, contentBytes: ByteArray) {
        withContext(Dispatchers.IO) {
            val outputStream = context.contentResolver.openOutputStream(uri, "wt")
                ?: throw IllegalStateException(
                    "The selected scorecard backup file could not be opened.",
                )

            outputStream.use { stream ->
                stream.write(contentBytes)
                stream.flush()
            }
        }
    }

    private suspend fun readBackup(uri: Uri): String = withContext(Dispatchers.IO) {
        val contentResolver = context.contentResolver
        val reportedLength = contentResolver.openAssetFileDescriptor(uri, "r")
            ?.use { descriptor -> descriptor.length }

        require(reportedLength == null || reportedLength <= MAX_BACKUP_BYTES) {
            "The selected scorecard backup is too large to import."
        }

        val inputStream = contentResolver.openInputStream(uri)
            ?: throw IllegalStateException(
                "The selected scorecard backup file could not be opened.",
            )

        inputStream.use { stream ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8 * 1024)
            var totalBytes = 0

            while (true) {
                val bytesRead = stream.read(buffer)

                if (bytesRead < 0) {
                    break
                }

                totalBytes += bytesRead

                require(totalBytes <= MAX_BACKUP_BYTES) {
                    "The selected scorecard backup is too large to import."
                }

                output.write(buffer, 0, bytesRead)
            }

            output.toString(StandardCharsets.UTF_8.name())
        }
    }
}
