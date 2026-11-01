import { requireNativeModule } from 'expo';

export const openAutomotiveSetup = () =>
    requireNativeModule('AutomotiveSetup').openSetup();
export async function finishAutomotiveSetup() {
    try {
        await require('@iternio/react-native-auto-play').HybridAutoPlay.popToRootTemplate(
            false,
        );
    } finally {
        await requireNativeModule('AutomotiveSetup').finishSetup();
    }
}
export const openAutomotiveAppSettings = () =>
    requireNativeModule('AutomotiveSetup').openAppSettings();
export const openAutomotiveLocationSettings = () =>
    requireNativeModule('AutomotiveSetup').openLocationSettings();
