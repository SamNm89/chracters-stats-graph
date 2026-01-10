# Google Drive Integration Guide

This document explains how Google Drive synchronization is implemented in this website. It allows users to backup and sync their data (stored locally) to a hidden "Application Data" folder in their personal Google Drive.

## Architecture

This implementation uses a **Client-Side Only** approach.

*   **No Backend Server:** The application connects directly from the user's browser to the Google Drive API using the [Google API Client Library for JavaScript (`gapi`)](https://github.com/google/google-api-javascript-client).
*   **Data Storage:**
    *   **Local:** Data is stored in the browser using `localforage` (which wraps IndexedDB/WebSQL/LocalStorage).
    *   **Remote:** Data is synced to a single file named `save.json` located in the user's Google Drive `appDataFolder`.
*   **Privacy:** The `appDataFolder` is a special hidden folder that is only accessible by this specific application. The app cannot see, read, or modify any other files in the user's Google Drive.

## Prerequisites (Google Cloud Setup)

To replicate this feature, you must set up a project in the Google Cloud Console.

### 1. Create a Project
1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a new project.

### 2. Enable Google Drive API
1.  Navigate to **APIs & Services > Library**.
2.  Search for "Google Drive API".
3.  Click **Enable**.

### 3. Configure OAuth Consent Screen
1.  Navigate to **APIs & Services > OAuth consent screen**.
2.  Select **External** user type (unless you are in a G-Suite organization).
3.  Fill in the application details (App name, support email, etc.).
4.  **Scopes:** This is critical. You must add the following scope:
    *   `https://www.googleapis.com/auth/drive.appdata`
    *   *Note: This scope grants access only to the application-specific configuration data.*
5.  **Test Users:** If your app is in "Testing" mode, add the Google emails of the users who will test the integration.

### 4. Create Credentials
1.  Navigate to **APIs & Services > Credentials**.
2.  **Create API Key:**
    *   Click **Create Credentials > API Key**.
    *   *(Recommended)* Restrict the key to "Google Drive API" and your website's HTTP Referrers (e.g., `http://localhost:3000`, `https://your-site.com`).
3.  **Create OAuth 2.0 Client ID:**
    *   Click **Create Credentials > OAuth client ID**.
    *   Select **Web application**.
    *   **Authorized JavaScript origins:** Add the URLs from where you will run the app (e.g., `http://localhost:3000` for dev, `https://your-site.com` for prod).
    *   **Authorized redirect URIs:** (Optional for this flow, but adding your site URL is good practice).
4.  **Copy Keys:** Note down the **Client ID** and **API Key**.

## Code Implementation Details

The implementation relies on two main files: `src/components/DataSync.svelte` (View/Logic) and `src/stores/saveManager.js` (State/Storage).

### Environment Variables
The application expects the credentials to be available in environment variables (using Vite's `import.meta.env`):
```env
VITE_GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_GOOGLE_DRIVE_API_KEY=your-api-key
```

### 1. The Sync Component (`src/components/DataSync.svelte`)

This component handles the lifecycle of the Google API client.

#### Loading the Library
It dynamically injects the `https://apis.google.com/js/api.js` script tag into the document body.
```javascript
const script = document.createElement('script');
script.src = 'https://apis.google.com/js/api.js';
document.body.appendChild(script);
```

#### Initialization
Once the script loads, it initializes the client:
```javascript
gapi.load('client:auth2', initClient);

function initClient() {
  gapi.client.init({
    apiKey: API_KEY,
    clientId: CLIENT_ID,
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    scope: 'https://www.googleapis.com/auth/drive.appdata'
  }).then(...)
}
```

#### Authentication
It listens for sign-in status changes. It validates that the user has granted the required scope.
```javascript
const hasScope = gapi.auth2.getAuthInstance().currentUser.get().hasGrantedScopes(SCOPES);
```

#### Sync Logic
1.  **Check for Remote File:** It queries Drive for a file named `save.json` in the `appDataFolder`.
    ```javascript
    gapi.client.drive.files.list({
      spaces: 'appDataFolder',
      q: "name = 'save.json'",
    })
    ```
2.  **Create if Missing:** If the file doesn't exist, it creates it.
    ```javascript
    gapi.client.drive.files.create({
      resource: { name: 'save.json', parents: ['appDataFolder'] },
      fields: 'id',
    })
    ```
3.  **Conflict Resolution:** It compares the local `update-time` with the remote data. If they differ significantly, it opens a **Conflict Modal** asking the user to choose "Use Cloud Data" or "Use Local Data".

#### Uploading Data
It updates the file content using a `PATCH` request with `uploadType: 'media'`.
```javascript
gapi.client.request({
  path: `/upload/drive/v3/files/${fileId}`,
  method: 'PATCH',
  params: { uploadType: 'media' },
  body: JSON.stringify(data),
});
```

### 2. State Management (`src/stores/saveManager.js`)

This file acts as the bridge between the app's state, local storage, and the remote sync component.

*   **Local Storage:** Uses `localforage` to store data reliably in the browser.
*   **Debouncing:** To avoid hitting Google API rate limits, uploads are debounced (delayed until updates stop for a few seconds).
    ```javascript
    const saveToRemote = debounce(async () => {
      saveData(await getLocalSaveJson());
    }, 5000);
    ```
*   **Triggering Sync:** When `updateSave` is called (e.g., user changes a setting), it saves locally and then triggers `saveToRemote` if the user is signed in.

## How to Apply This to Your Website

To implement this in your own project:

1.  **Install Dependencies:**
    You'll need `localforage` (or similar storage) and `lodash.debounce`.
    ```bash
    npm install localforage lodash.debounce dayjs
    ```

2.  **Copy the Setup:**
    Follow the "Prerequisites" section to get your Client ID and API Key.

3.  **Create the Auth/Sync Component:**
    *   Create a component (e.g., `GoogleDriveSync.js` or `.svelte` or `.jsx`) that loads `gapi`.
    *   Implement `initClient`, `signIn`, and `signOut` methods.
    *   **Important:** Ensure you use the `https://www.googleapis.com/auth/drive.appdata` scope.

4.  **Implement Data Handling:**
    *   **Read:** Use `gapi.client.drive.files.get({ fileId, alt: 'media' })` to download the JSON.
    *   **Write:** Use the `PATCH` method described above to upload the JSON string.

5.  **Integrate with State:**
    *   When your app loads, check if the user is signed in.
    *   If signed in, fetch the remote file and compare timestamps.
    *   If the remote file is newer, update your local state.
    *   Subscribe to your local state changes to trigger uploads automatically.

## References

*   [Google Drive API v3 Documentation](https://developers.google.com/drive/api/v3/about-sdk)
*   [GAPI Client Library](https://github.com/google/google-api-javascript-client)
*   [Application Data Folder](https://developers.google.com/drive/api/v3/appdata)
