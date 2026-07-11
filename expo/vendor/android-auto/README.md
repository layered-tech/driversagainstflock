# Android Auto Emulator APK

This folder stores the Android Auto split APK bundle used for emulator/DHU testing.

- Package: `com.google.android.projection.gearhead`
- Version: `16.9.666314-release`
- File: `android-auto-16.9.666314.xapk`
- SHA-256: `f172d6a41a211bf2a2ace5c91d8e7634bc1d0a228857b1695c0ca09ccf429269`
- Source URL: `https://d.apkpure.net/b/XAPK/com.google.android.projection.gearhead?versionCode=169666314`

The XAPK is a zip archive containing Android App Bundle split APKs. The current emulator uses `arm64-v8a` and 480 dpi, so reinstall with:

```sh
mkdir -p /private/tmp/android-auto-16.9.666314
unzip -o vendor/android-auto/android-auto-16.9.666314.xapk -d /private/tmp/android-auto-16.9.666314
adb -s emulator-5554 install-multiple -r -d \
  /private/tmp/android-auto-16.9.666314/com.google.android.projection.gearhead.apk \
  /private/tmp/android-auto-16.9.666314/config.arm64_v8a.apk \
  /private/tmp/android-auto-16.9.666314/config.xxxhdpi.apk \
  /private/tmp/android-auto-16.9.666314/config.en.apk
```

