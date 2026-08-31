export async function saveDraftBeforeExit(saveDraft, exit) {
    const draftWasSaved = await saveDraft();

    if (!draftWasSaved) {
        return false;
    }

    exit();

    return true;
}
