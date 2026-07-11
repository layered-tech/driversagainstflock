import { ActivityIndicator } from 'react-native';
import { Icon } from '../design-system/icon';

export function OfflineMapActionIcon({ color, icon, isLoading }) {
    if (isLoading) {
        return <ActivityIndicator color={color} size="small" />;
    }

    return <Icon color={color} name={icon} size={14} />;
}
