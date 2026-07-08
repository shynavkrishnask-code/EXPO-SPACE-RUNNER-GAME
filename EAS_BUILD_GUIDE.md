# EAS Build Guide: Generating Android APK & AAB

This guide provides step-by-step instructions for configuring Expo Application Services (EAS) and generating installable Android builds (`.apk` for testing, `.aab` for Google Play distribution).

---

## Step 1: Create an Expo Account
1. Open your web browser and navigate to [https://expo.dev/signup](https://expo.dev/signup).
2. Enter your email, choose a username, and select a password to register for a free account.
3. Confirm your email address via the verification link sent to your inbox.

---

## Step 2: Install and Log In to EAS CLI
EAS CLI is the command-line utility used to communicate with Expo cloud build servers.

1. **Install EAS CLI globally** on your machine:
   ```bash
   npm install -g eas-cli
   ```
   *Expected Output:*
   ```text
   added 280 packages in 12s
   ```

2. **Log in to your Expo account** via the CLI:
   ```bash
   eas login
   ```
   *Expected Output:*
   ```text
   ✔ Email or username: your_username
   ✔ Password: **********
   Logged in as your_username
   ```

---

## Step 3: Link Project and Configure EAS
1. **Initialize the project** with EAS:
   ```bash
   eas project:init
   ```
   *Expected Output:*
   ```text
   ✔ Project owner: your_username
   ✔ Project slug: SpaceEscapeRunner
   Project linked successfully!
   ```

2. **Configure builds**:
   ```bash
   eas build:configure
   ```
   *Expected Output:*
   ```text
   ✔ Would you like to configure EAS Build? › Yes
   ✔ All platforms (Android, iOS)
   Created eas.json in the root directory.
   ```

---

## Step 4: Configure Android Package Name
To build for Android, your app must have a unique identifier called a **package name** in `app.json`.

1. Open `app.json`.
2. Locate the `"android"` section and ensure `"package"` is defined under it. If not, add it:
   ```json
   "android": {
     "package": "com.yourusername.spaceescaperunner",
     "adaptiveIcon": { ... }
   }
   ```

---

## Step 5: Configure eas.json for APK Generation (Preview Build)
By default, EAS generates Android App Bundles (`.aab`) which are optimized for Google Play but cannot be installed directly on a phone. To create an installable `.apk` file for manual testing:

1. Open `eas.json` (created in Step 3).
2. Ensure the `"preview"` profile is configured under `"build"` to build an APK:
   ```json
   {
     "cli": {
       "version": ">= 9.0.0"
     },
     "build": {
       "development": {
         "developmentClient": true,
         "distribution": "internal"
       },
       "preview": {
         "distribution": "internal",
         "android": {
           "buildType": "apk"
         }
       },
       "production": {}
     }
   }
   ```

---

## Step 6: Generate and Download the Android APK (Testing Build)
1. **Run the preview build command**:
   ```bash
   eas build --platform android --profile preview
   ```
   *Expected Terminal Interaction & Output:*
   ```text
   ✔ Generate a new Android Keystore? › Yes (Let Expo handle keys)
   
   Build details: https://expo.dev/accounts/your_username/projects/SpaceEscapeRunner/builds/...
   Waiting for build to complete (this runs on Expo's cloud servers, usually takes 5-10 minutes)...
   
   ✔ Build finished!
   
   Android APK URL:
   https://expo.dev/artifacts/eas/...apk
   ```

2. **Download the APK**:
   - Scan the QR code displayed in the terminal using your phone to download the `.apk` directly.
   - Alternatively, copy the generated `.apk` link, open it in your browser, and download the file. Install it on your Android device (ensure "Install from Unknown Sources" is enabled in settings).

---

## Step 7: Generate the Android AAB (Google Play Store Bundle)
1. **Run the production build command**:
   ```bash
   eas build --platform android --profile production
   ```
   *Expected Terminal Interaction & Output:*
   ```text
   Build details: https://expo.dev/accounts/your_username/projects/SpaceEscapeRunner/builds/...
   Waiting for build to complete on Expo servers...
   
   ✔ Build finished!
   
   Android AAB URL:
   https://expo.dev/artifacts/eas/...aab
   ```

2. **Download the AAB**:
   - Access the Expo dashboard link provided in the terminal output.
   - Click the **Download** button to retrieve your `.aab` file, which is ready to be uploaded to Google Play Console.
