package expo.modules.scorecardbackupfile

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import java.io.Serializable

internal enum class BackupDocumentOperation : Serializable {
    EXPORT,
    IMPORT,
}

internal data class BackupDocumentRequest(
    val operation: BackupDocumentOperation,
    val suggestedFilename: String? = null,
) : Serializable

internal sealed class BackupDocumentResult {
    data class Selected(val uri: Uri) : BackupDocumentResult()

    data object Cancelled : BackupDocumentResult()
}

internal class BackupDocumentContract :
    AppContextActivityResultContract<BackupDocumentRequest, BackupDocumentResult> {
    override fun createIntent(context: Context, input: BackupDocumentRequest): Intent {
        val action = when (input.operation) {
            BackupDocumentOperation.EXPORT -> Intent.ACTION_CREATE_DOCUMENT
            BackupDocumentOperation.IMPORT -> Intent.ACTION_OPEN_DOCUMENT
        }

        return Intent(action).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/json"

            if (input.operation == BackupDocumentOperation.EXPORT) {
                putExtra(
                    Intent.EXTRA_TITLE,
                    input.suggestedFilename ?: "daf-scorecard-backup.json",
                )
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            } else {
                putExtra(
                    Intent.EXTRA_MIME_TYPES,
                    arrayOf(
                        "application/json",
                        "application/octet-stream",
                        "text/json",
                        "text/plain",
                    ),
                )
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        }
    }

    override fun parseResult(
        input: BackupDocumentRequest,
        resultCode: Int,
        intent: Intent?,
    ): BackupDocumentResult {
        val uri = intent?.data

        return if (resultCode == Activity.RESULT_OK && uri != null) {
            BackupDocumentResult.Selected(uri)
        } else {
            BackupDocumentResult.Cancelled
        }
    }
}
