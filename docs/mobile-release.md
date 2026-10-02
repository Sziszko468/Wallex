# WALLEX mobile — build & release guide

How the Expo app becomes installable iOS and Android binaries: the build variants,
configuration, secrets policy, and the path to TestFlight / App Store and Google Play.

Everything here is built with **EAS Build** in the cloud, so no Mac is needed, not even
for iOS. Run all commands from `mobile/`. Use EAS CLI via `npx eas-cli@latest …` (no global
install needed). The examples below write it as `eas`.

## 1. Build variants

| | development | preview | production |
|---|---|---|---|
| Profile (`eas.json`) | `development` (+ `development-simulator`) | `preview` | `production` |
| Purpose | Daily development with hot reload | Testers, QA, real-device checks | TestFlight / App Store, Google Play |
| App name on the device | WALLEX (Dev) | WALLEX (Preview) | WALLEX |
| iOS bundle ID / Android package | `com.szilard.wallex.dev` | `com.szilard.wallex.preview` | `com.szilard.wallex` |
| JavaScript | Loaded from your computer (Metro) | Embedded, release mode | Embedded, release mode |
| API URL | Auto-detected dev machine (`http://<LAN-IP>:8000/api`) | `EXPO_PUBLIC_API_BASE_URL` from the EAS `preview` environment (https) | … from the EAS `production` environment (https) |
| Distribution | Internal (APK / registered iPhones) | Internal (APK / registered iPhones) | Store (AAB / IPA) |

Because each variant has its own identifier, all three can be installed on one phone at
the same time.

**How variants work:**

- Each build profile sets `APP_VARIANT` in `eas.json`.
- `app.config.ts` derives the name and identifiers from the production values in `app.json`.
- Commands that don't build a binary (`expo start`, `eas submit`, `eas credentials`) leave
  `APP_VARIANT` unset, so they see the production identity. That is exactly what
  submitting to the stores and managing credentials need.

## 2. App identity and versioning

| Setting | Where | Value | Notes |
|---|---|---|---|
| App name | `app.json` → `name` | `WALLEX` | Shown under the icon; variants get a suffix. |
| iOS bundle identifier | `app.json` → `ios.bundleIdentifier` | `com.szilard.wallex` | **Cannot change** once the app exists in App Store Connect. |
| Android package | `app.json` → `android.package` | `com.szilard.wallex` | **Cannot change** once uploaded to Google Play. |
| Version (user-facing) | `app.json` → `version` | `1.0.0` | Bump manually for each store release (semver). |
| Build number / versionCode | EAS servers (`appVersionSource: "remote"`) | automatic | `production` builds increment it (`autoIncrement`), so you never edit it by hand. |
| Deep link scheme | `app.json` → `scheme` | `wallex` | |
| iPad | `ios.supportsTablet` | `false` | Phone-only: no iPad screenshots or layouts required. The app still runs on iPad in iPhone mode. |
| Orientation / theme | `orientation`, `userInterfaceStyle` | portrait / light | |

Change the identifiers **before** the first store upload if you want a different
reverse-domain name. Edit `app.json`; the variant suffixes follow automatically.

## 3. Configuration files

| File | Role |
|---|---|
| `app.json` | Static base config, i.e. the production app: identity, icons, splash, permissions, plugins. `eas init` writes the project ID here. |
| `app.config.ts` | Dynamic layer: variant names/IDs, build-time API URL check, release-only permission blocking, Firebase file from the build environment. |
| `eas.json` | Build profiles (`development`, `development-simulator`, `preview`, `production`) and the submit profile. |
| `assets/` | `icon.png`, `android-icon-{foreground,background,monochrome}.png`, `splash-icon.png`, `notification-icon.png`, `favicon.png` |

Check the resolved config for any variant:

```bash
APP_VARIANT=preview EXPO_PUBLIC_API_BASE_URL=https://wallex.example.com/api npx expo config --type public
```

## 4. Environment configuration and the production API URL

The app has exactly **one** build-time setting, `EXPO_PUBLIC_API_BASE_URL`. It is not a
secret, but it lives in **EAS environments** rather than the repository, so each
environment can point at its own backend:

```bash
eas env:set --name EXPO_PUBLIC_API_BASE_URL --value https://wallex.example.com/api --environment production --visibility plaintext
eas env:set --name EXPO_PUBLIC_API_BASE_URL --value https://staging.wallex.example.com/api --environment preview --visibility plaintext
eas env:list --environment production
```

- **`development` needs nothing.** The app finds your computer through the Expo dev
  server connection. For an Android emulator or an unusual network, set it in `mobile/.env`
  (see `.env.example`).
- **The URL is checked twice:**
  - **At build time:** `app.config.ts` fails a `preview` or `production` build when the URL
    is missing, malformed or not `https`. You get an error message instead of a broken
    binary.
  - **At runtime:** `utils/apiBaseUrl.ts` refuses non-https URLs in any release build.
- **Point it at the backend's public origin:** with the default deployment (web
  container proxying `/api/`) that is `https://<your-domain>/api`. See
  [deployment.md](deployment.md).
- **To reproduce an EAS environment locally**, e.g. to test against staging:
  `eas env:pull --environment preview` writes the variables to a local `.env` file,
  which is gitignored.

## 5. Secrets policy: nothing secret ships in the app

Anything inside an app binary can be extracted by its users. `EXPO_PUBLIC_*` values are
inlined into the JavaScript bundle, and `app.config.ts` output is readable through
`expo-constants`.

| Item | In the app? | Where it lives |
|---|---|---|
| API base URL | yes (public) | EAS environment variable (plaintext) |
| User tokens | only at runtime | Refresh token in Keychain/Keystore (SecureStore), access token in memory |
| Android upload keystore | no | EAS credentials (generated by EAS on the first build) |
| iOS distribution certificate + provisioning profiles | no | EAS credentials |
| APNs key (iOS push) | no | EAS credentials |
| FCM V1 service account key (Android push) | no | EAS credentials, used by Expo's push service |
| `google-services.json` (Firebase client config) | compiled in, not secret by design | EAS **file** variable `GOOGLE_SERVICES_JSON`, not committed |
| Google Play service account key (for `eas submit`) | no | EAS credentials |
| App Store Connect API key (for `eas submit`) | no | EAS credentials |
| Backend secrets (`DJANGO_SECRET_KEY`, `EXPO_PUSH_ACCESS_TOKEN`…) | never | Backend environment only |

These rules are enforced, not just documented:

- **Tests** (`__tests__/security/releaseConfig.test.ts`):
  - the only environment variable app code reads is `EXPO_PUBLIC_API_BASE_URL`,
  - the resolved config never copies values from the build environment,
  - `extra` holds no custom keys.
- **`.gitignore`:** keystores, `.p8`/`.p12` files, `credentials.json`,
  `google-services.json` and service account JSON files are ignored.

## 6. App icon and splash screen

| Asset | Spec | Used for |
|---|---|---|
| `icon.png` | 1024×1024, opaque (iOS rejects transparency) | iOS app icon, store listing |
| `android-icon-foreground.png` | 1024×1024, transparent; glyph inside the central ~61 % safe circle | Android adaptive icon |
| `android-icon-background.png` + `backgroundColor #4F46E5` | 1024×1024 | Android adaptive icon background |
| `android-icon-monochrome.png` | White on transparent | Android 13+ themed icons |
| `splash-icon.png` | White glyph on transparent, shown 160 dp wide on `#4F46E5` | Splash screen (`expo-splash-screen` plugin) |
| `notification-icon.png` | 96×96, all white on transparent | Android status-bar notification icon, tinted `#4F46E5` |
| `favicon.png` | 48×48 | Web preview |

The design is a donut chart (spending by category) on the brand indigo. Icon and splash
changes are native, so they need a new build; an OTA update cannot change them.

## 7. Permissions

The app asks for a permission only at the moment the feature is used, never on first launch.

| Feature | iOS (Info.plist text) | Android | Asked when |
|---|---|---|---|
| Receipt photo (camera) | `NSCameraUsageDescription` | `CAMERA` | Tapping "Take photo" |
| Receipt from library | `NSPhotoLibraryUsageDescription` (the system picker needs no access) | none (system photo picker) | — |
| Biometric unlock | `NSFaceIDUsageDescription` | `USE_BIOMETRIC`, `USE_FINGERPRINT` | Enabling "Biometric lock" |
| Push notifications | system prompt | `POST_NOTIFICATIONS` (Android 13+) | Enabling notifications |
| Network | — | `INTERNET` | — |

**Explicitly removed** (`tools:node="remove"` in the generated manifest):

- `RECORD_AUDIO`: receipts are photos, not videos (`microphonePermission: false`).
- `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`: not needed, because the system
  photo picker is used.
- `SYSTEM_ALERT_WINDOW`: only the dev menu needs it, so it is kept in development builds
  only.

**Release builds also:**

- drop the dev launcher's `NSLocalNetworkUsageDescription`, which `expo-dev-client` adds
  to every build,
- declare `ITSAppUsesNonExemptEncryption = false`. The app uses only standard HTTPS, so
  App Store Connect skips the export-compliance question.

To inspect the final result without building:

```bash
APP_VARIANT=production EXPO_PUBLIC_API_BASE_URL=https://wallex.example.com/api npx expo config --type introspect
```

## 8. Development build

A development build is your own version of Expo Go. It contains every native module the
app uses, including SecureStore, biometrics, push, camera and notifications. Expo Go
cannot receive push notifications on Android, and it cannot show your own Face ID text.

**One-time setup:**

```bash
eas login
eas init
```

- **`eas login`:** signs you in with an Expo account (free).
- **`eas init`:** creates the EAS project and writes `extra.eas.projectId` + `owner`
  into `app.json`. Commit that change, because push tokens need the project ID.

**Android** (APK, install on a phone or emulator):

```bash
eas build --profile development --platform android
```

**iPhone** (requires a paid Apple Developer account; each test device must be registered once):

```bash
eas device:create
eas build --profile development --platform ios
```

`eas device:create` opens a registration link on the iPhone.

**iOS Simulator** (needs a Mac to run the simulator):

```bash
eas build --profile development-simulator --platform ios
```

**Daily work:** install the build from the link or QR code EAS prints, then on your computer:

```bash
npm start
```

Open the app on the phone; it finds the dev server on the same Wi-Fi. `npm run start:go`
still opens the project in Expo Go, for pure-JS work.

Rebuild the development build only when native things change:

- a package with native code is added or updated,
- `app.json` / `app.config.ts` changes,
- icons or the splash screen change,
- the Expo SDK is upgraded.

JavaScript changes never need a rebuild.

**Building locally instead:** `npx expo run:android` / `npx expo run:ios` build on your
own machine (Android Studio / Xcode). Set `APP_VARIANT=development` for them. Otherwise
the production identity is used, and on iOS the dev launcher loses its local-network
permission text.

## 9. Preview build

A release-mode app for testers: no dev menu, JavaScript embedded, pointing at a real
https backend.

```bash
eas env:set --name EXPO_PUBLIC_API_BASE_URL --value https://wallex.example.com/api --environment preview --visibility plaintext
eas build --profile preview --platform android
eas build --profile preview --platform ios
```

- **Android** produces an **APK**. Anyone with the link can install it (allow "install
  unknown apps").
- **iOS** produces an **ad-hoc** build. It installs only on devices registered with
  `eas device:create` (Apple Developer account required). For wider iOS testing use
  TestFlight (section 11).

Test on a preview build everything the web preview cannot show:

- Face ID / fingerprint lock and relock after 60 s in the background,
- push notifications (after the credentials in section 12),
- camera receipt scan,
- airplane-mode offline queue and sync.

## 10. Production build

```bash
eas env:set --name EXPO_PUBLIC_API_BASE_URL --value https://wallex.example.com/api --environment production --visibility plaintext
eas build --profile production --platform all
```

- **Output:** an **AAB** for Google Play and an **IPA** for the App Store.
- **Build numbers** are incremented on EAS automatically. Bump `version` in `app.json` for
  every store release users should see as new.
- **First build:** EAS asks to create the signing credentials (Android keystore; iOS
  certificate + provisioning profile). Let EAS manage them. They are stored in your Expo
  account, never in the repository.

Before every production build:

- [ ] Backend deployed and `https://<domain>/api/health/ready/` returns `ok` ([deployment.md](deployment.md))
- [ ] `EXPO_PUBLIC_API_BASE_URL` set in the `production` environment
- [ ] `version` bumped in `app.json`
- [ ] `npx tsc --noEmit`, `npm test`, `npx expo-doctor` all green
- [ ] Tested on a preview build against the same backend

Shortcut: `eas build --profile production --platform all --auto-submit` builds and
submits in one step.

## 11. iOS deployment (TestFlight → App Store)

**Requirements:**

- An Apple Developer Program membership (paid, yearly).
- A Mac is **not** required: EAS builds and submits from Windows.

**Steps:**

1. **Production build:** `eas build --profile production --platform ios` (section 10).
2. **Submit:** `eas submit --platform ios --latest`.
   - The first time, sign in with your Apple ID. EAS can create the App Store Connect
     app record and an App Store Connect API key, then stores the key in EAS.
   - To avoid questions later, add the record's ID to `eas.json`:
     `submit.production.ios.ascAppId`.
3. **TestFlight:** after Apple's processing (typically 10–30 min) the build appears in
   TestFlight.
   - Internal testers (your team, up to 100) can install it immediately.
   - External testers require a short beta review.
4. **App Store listing in App Store Connect:**
   - iPhone screenshots in the display sizes App Store Connect requests,
   - description, keywords, support URL,
   - **privacy policy URL** (required),
   - **App Privacy** questionnaire: data collected = email address and financial info,
     linked to the user, not used for tracking.
5. **App Review notes: give a demo account.** WALLEX requires login, and reviewers
   reject apps they cannot get past the login screen. Create a demo user with sample
   transactions on the production backend and put its credentials in the review notes.
   Do not put them in the repository.
6. **Release:** submit for review, then release manually or automatically.

Already handled in the config:

- export-compliance flag,
- Face ID / camera / photo usage texts,
- no iPad requirement,
- the required-reason privacy manifest. React Native and the Expo modules ship their own,
  and prebuild merges them.

## 12. Android deployment (Google Play)

**Requirements:**

- A Google Play Console developer account (one-time registration fee).
- New personal accounts must run a **closed test with testers for a period of time**
  before production access is granted. Check the current requirement in Play Console
  and plan for it.

**Steps:**

1. **Create the app in Play Console:** name "WALLEX", app (not game), free.
2. **Service account for automated submits:**
   - Create a Google Cloud service account with access to your Play Console account.
   - Download its JSON key, then upload it to EAS (`eas credentials` → Android →
     Google Service Account). The JSON key never goes into the repository.
3. **Production build:** `eas build --profile production --platform android` (section 10).
4. **Submit:** `eas submit --platform android --latest`.
   - The `production` submit profile uploads to the **internal testing** track as a
     **draft**. Google only accepts draft releases until the app's first release has
     been rolled out.
   - Open the draft in Play Console and roll it out to internal testers.
5. **Play App Signing:** the keystore EAS created is your **upload key**; Google holds the
   app signing key. If the upload key is ever lost, reset it through Play Console. No
   users are lost.
6. **Store listing and policies:**
   - short and full description, screenshots, feature graphic (1024×500),
   - privacy policy URL,
   - **Data safety** form (email, financial info; encrypted in transit; users can
     request deletion),
   - content rating questionnaire,
   - target audience.
7. **Promote:** internal → closed → production (Play Console → Testing → Promote release).

After the first release is live, you can set `"releaseStatus": "completed"` in `eas.json`
(`submit.production.android`), so internal-track uploads go out without the manual step.

## 13. Push notification credentials

| Platform | What | How |
|---|---|---|
| iOS | APNs key | `eas credentials` → iOS → Push Notifications → let EAS create it. Needs the Apple Developer account. |
| Android | FCM V1 | 1. Create a Firebase project and add an Android app with package `com.szilard.wallex` (and `.preview` / `.dev` if you test push there). 2. Download `google-services.json` and store it as an EAS file variable (below). 3. Upload an FCM V1 service account key via `eas credentials` → Android → FCM V1. |

Store `google-services.json` as an EAS file variable for each environment you test push in:

```bash
eas env:set --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment production --visibility sensitive
```

Delete the local copy afterwards; it is gitignored anyway. During the build, EAS writes
the file outside the project and passes its path in `GOOGLE_SERVICES_JSON`, which
`app.config.ts` picks up. The backend's hourly delivery job is described in
[deployment.md](deployment.md), section 11.

## 14. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL is missing for the production build` | Set it in the EAS environment of that profile (section 4). Visibility must be `plaintext` or `sensitive`: EAS CLI cannot read `secret` variables when resolving the config. |
| `must use https for the … build` | Release builds only talk https. For a local backend, use a development build. |
| App opens to a crash / red screen right after install (release) | Built without a valid URL by bypassing the config check (e.g. a local `expo run` in release mode). Rebuild with the URL set. |
| Development build can't find the dev server | Phone and computer on the same network? Try `npm start -- --tunnel`. For the Android emulator, set `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000/api` in `.env`. |
| iOS internal build won't install | The device isn't registered: run `eas device:create`, then rebuild (the profile embeds the device list). |
| Play Console: "Only releases with status draft may be created on draft app" | Keep `releaseStatus: "draft"` until the first release is rolled out. |
| No push on Android release builds | `GOOGLE_SERVICES_JSON` not set for that environment, or the FCM V1 key not uploaded (section 13). |
| Icon / splash didn't change | Native change: rebuild. Development builds need a rebuild too. |
