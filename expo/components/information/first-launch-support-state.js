export const FIRST_LAUNCH_SUPPORT_STORAGE_KEY =
    'daf:first-launch-support:completed';

export async function shouldShowFirstLaunchSupport(storage) {
    return (await storage.getItem(FIRST_LAUNCH_SUPPORT_STORAGE_KEY)) === null;
}

export async function completeFirstLaunchSupport(storage, openDonation) {
    await storage.setItem(FIRST_LAUNCH_SUPPORT_STORAGE_KEY, 'true');

    if (openDonation) {
        await openDonation();
    }
}
