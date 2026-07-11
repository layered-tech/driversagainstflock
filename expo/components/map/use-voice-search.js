import { useCallback, useEffect, useState } from 'react';
import {
    getSpeechRecognitionModule,
    getVoiceSearchErrorMessage,
    VOICE_SEARCH_ANDROID_LANGUAGE_MODEL,
    VOICE_SEARCH_IOS_TASK_HINT,
    VOICE_SEARCH_LOCALE,
} from './speech-recognition';

export function useVoiceSearch({
    handleSearchChange,
    isMountedRef,
    setSearchIsFocused,
}) {
    const [voiceSearchError, setVoiceSearchError] = useState('');
    const [voiceSearchIsListening, setVoiceSearchIsListening] = useState(false);

    const abortVoiceSearch = useCallback(() => {
        try {
            getSpeechRecognitionModule()?.abort();
        } catch {}
        setVoiceSearchIsListening(false);
    }, []);

    const handleVoiceSearchPress = useCallback(() => {
        const speechRecognition = getSpeechRecognitionModule();

        setSearchIsFocused(true);

        if (!speechRecognition) {
            setVoiceSearchError('Voice search is not available in this build.');
            return;
        }

        if (voiceSearchIsListening) {
            try {
                speechRecognition.stop();
            } catch {
                setVoiceSearchIsListening(false);
            }
            return;
        }

        setVoiceSearchError('');

        try {
            if (!speechRecognition.isRecognitionAvailable()) {
                setVoiceSearchError(
                    'Voice search is not available on this device.',
                );
                return;
            }
        } catch {
            setVoiceSearchError('Voice search is not available in this build.');
            return;
        }

        speechRecognition
            .requestPermissionsAsync()
            .then((permission) => {
                if (!isMountedRef.current) {
                    return;
                }

                if (!permission?.granted) {
                    setVoiceSearchError(
                        permission?.canAskAgain === false
                            ? 'Enable microphone and speech recognition permissions in settings to use voice search.'
                            : 'Microphone and speech recognition permission is required for voice search.',
                    );
                    return;
                }

                setSearchIsFocused(true);
                speechRecognition.start({
                    androidIntentOptions: {
                        EXTRA_LANGUAGE_MODEL:
                            VOICE_SEARCH_ANDROID_LANGUAGE_MODEL,
                    },
                    continuous: false,
                    interimResults: true,
                    iosTaskHint: VOICE_SEARCH_IOS_TASK_HINT,
                    lang: VOICE_SEARCH_LOCALE,
                    maxAlternatives: 1,
                });
            })
            .catch(() => {
                if (isMountedRef.current) {
                    setVoiceSearchError('Voice search could not be started.');
                }
            });
    }, [isMountedRef, setSearchIsFocused, voiceSearchIsListening]);

    useEffect(() => {
        const speechRecognition = getSpeechRecognitionModule();

        if (!speechRecognition) {
            return undefined;
        }

        const listeners = [
            speechRecognition.addListener('start', () => {
                setVoiceSearchError('');
                setVoiceSearchIsListening(true);
                setSearchIsFocused(true);
            }),
            speechRecognition.addListener('end', () => {
                setVoiceSearchIsListening(false);
            }),
            speechRecognition.addListener('nomatch', () => {
                setVoiceSearchIsListening(false);
                setVoiceSearchError(
                    'No speech was detected. Try again when you are ready.',
                );
            }),
            speechRecognition.addListener('result', (event) => {
                const transcript = event?.results?.[0]?.transcript?.trim();

                if (!transcript) {
                    return;
                }

                handleSearchChange(transcript);
            }),
            speechRecognition.addListener('error', (event) => {
                setVoiceSearchIsListening(false);

                if (event?.error === 'aborted') {
                    return;
                }

                setVoiceSearchError(getVoiceSearchErrorMessage(event));
                setSearchIsFocused(true);
            }),
        ];

        return () => {
            listeners.forEach((listener) => listener.remove());
        };
    }, [handleSearchChange, setSearchIsFocused]);

    useEffect(
        () => () => {
            try {
                getSpeechRecognitionModule()?.abort();
            } catch {}
        },
        [],
    );

    return {
        abortVoiceSearch,
        handleVoiceSearchPress,
        setVoiceSearchError,
        voiceSearchError,
        voiceSearchIsListening,
    };
}
