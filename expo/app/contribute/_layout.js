import { Stack } from 'expo-router/stack';
import { duoPaneScreenLayout } from '../../components/root/duo-pane-screen';

export default function ContributeLayout() {
    return (
        <Stack
            screenLayout={duoPaneScreenLayout}
            screenOptions={{ headerShown: false }}
        />
    );
}
