import { Stack } from 'expo-router/stack';
import {
    DuoMapModalScreen,
    duoPaneScreenLayout,
} from '../../components/root/duo-pane-screen';

export function editScreenLayout({ children, route }) {
    return route.params?.action === 'remove' ? (
        <DuoMapModalScreen>{children}</DuoMapModalScreen>
    ) : (
        duoPaneScreenLayout({ children })
    );
}

export default function EditsLayout() {
    return (
        <Stack
            screenLayout={editScreenLayout}
            screenOptions={{ headerShown: false }}
        />
    );
}
