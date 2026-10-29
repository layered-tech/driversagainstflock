import { Stack } from 'expo-router/stack';
import { DuoPaneScreen } from '../../components/root/duo-pane-screen';

function screenLayout({ children, route }) {
    return ['index', 'timeline'].includes(route.name) ? (
        <DuoPaneScreen>{children}</DuoPaneScreen>
    ) : (
        children
    );
}

export default function ScorecardLayout() {
    return (
        <Stack
            screenLayout={screenLayout}
            screenOptions={{ headerShown: false }}
        />
    );
}
