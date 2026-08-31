export async function runChangesetUpload({
    close,
    create,
    onProgress,
    upload,
}) {
    onProgress?.('creating-changeset');

    const changesetId = await create();
    let uploadError = null;
    let uploadResult;

    onProgress?.('uploading');

    try {
        uploadResult = await upload(changesetId);
    } catch (error) {
        uploadError = error;
    }

    onProgress?.('closing');

    let closeFailed = false;

    try {
        closeFailed = (await close(changesetId)) === true;
    } catch (closeError) {
        if (!uploadError) {
            throw closeError;
        }

        closeFailed = true;
    }

    if (uploadError) {
        throw uploadError;
    }

    return { changesetId, closeFailed, uploadResult };
}
