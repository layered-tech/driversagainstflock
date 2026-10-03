import { ErrorBoundary as RouterErrorBoundary } from 'expo-router';
import { useEffect } from 'react';
import { recordCrashlyticsError } from '../../lib/crashlytics';

export function CrashReportingErrorBoundary(props) {
    useEffect(() => {
        recordCrashlyticsError(props.error);
    }, [props.error]);

    return <RouterErrorBoundary {...props} />;
}
