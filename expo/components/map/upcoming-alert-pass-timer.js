import { View } from 'react-native';
import { getUpcomingAlertPassProgress } from './driving-alerts';

export function UpcomingAlertPassTimer({ accentColor, distanceMeters }) {
    const passProgress = getUpcomingAlertPassProgress(distanceMeters);

    return (
        <View
            className="dark:bg-daf-border-dark absolute bottom-0 left-0 right-0 h-1 bg-daf-border"
            pointerEvents="none"
            testID="upcoming-alert-pass-timer"
        >
            <View
                className="h-full"
                style={{
                    backgroundColor: accentColor,
                    width: `${passProgress * 100}%`,
                }}
            />
        </View>
    );
}
