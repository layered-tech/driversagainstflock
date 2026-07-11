export const VOICE_SEARCH_LOCALE = "en-US";
export const VOICE_SEARCH_ANDROID_LANGUAGE_MODEL = "web_search";
export const VOICE_SEARCH_IOS_TASK_HINT = "search";

let speechRecognitionModule;

export function getVoiceSearchErrorMessage(event) {
  switch (event?.error) {
    case "not-allowed":
      return "Microphone and speech recognition permission is required for voice search.";
    case "service-not-allowed":
      return "Voice search is not available on this device.";
    case "language-not-supported":
      return "Voice search does not support this language on this device.";
    case "network":
      return "Voice search needs a network connection. Try again when you are online.";
    case "no-speech":
    case "speech-timeout":
      return "No speech was detected. Try again when you are ready.";
    case "audio-capture":
      return "The microphone is not available for voice search.";
    case "busy":
      return "Voice search is already listening.";
    default:
      return event?.message || "Voice search could not be started.";
  }
}

export function getSpeechRecognitionModule() {
  if (speechRecognitionModule !== undefined) {
    return speechRecognitionModule;
  }

  try {
    // Lazy-load so old native builds fail gracefully until rebuilt with the plugin.
    speechRecognitionModule =
      require("expo-speech-recognition").ExpoSpeechRecognitionModule;
  } catch {
    speechRecognitionModule = null;
  }

  return speechRecognitionModule;
}
