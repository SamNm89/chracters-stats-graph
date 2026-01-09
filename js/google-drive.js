
// Configuration
// NOTE: This Client ID is a placeholder. The user must replace it with their own from Google Cloud Console.
// User Instructions: 
// 1. Go to https://console.cloud.google.com/
// 2. Create a project > APIs & Services > Credentials > Create OAuth 2.0 Client ID (Web Application)
// 3. Add your URLs (http://localhost:..., https://your-username.github.io) to "Authorized JavaScript origins"
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const API_KEY = ''; // Optional, usually strictly for public data, but OAuth is key here.
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

export class GoogleDriveSync {
    constructor(callbacks) {
        this.tokenClient = null;
        this.accessToken = null;
        this.callbacks = callbacks || {}; // { onSignIn: (user) => {}, onSignOut: () => {} }
        this.isInitialized = false;
    }

    // Load the scripts dynamically
    loadScripts() {
        return new Promise((resolve) => {
            const script1 = document.createElement('script');
            script1.src = "https://accounts.google.com/gsi/client";
            script1.onload = () => {
                const script2 = document.createElement('script');
                script2.src = "https://apis.google.com/js/api.js";
                script2.onload = () => resolve();
                document.body.appendChild(script2);
            };
            document.body.appendChild(script1);
        });
    }

    async init() {
        if (!CLIENT_ID || CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
            console.warn('Google Sync: No Client ID provided.');
            return;
        }

        await this.loadScripts();

        // Initialize gapi client
        await new Promise((resolve) => gapi.load('client', resolve));
        await gapi.client.init({
            discoveryDocs: [DISCOVERY_DOC],
        });

        // Initialize Identity Services client
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
                if (tokenResponse.error !== undefined) {
                    throw tokenResponse;
                }
                this.accessToken = tokenResponse.access_token;
                if (this.callbacks.onSignIn) this.callbacks.onSignIn();
            },
        });

        this.isInitialized = true;
    }

    handleAuthClick() {
        if (!this.isInitialized) {
            alert("Google Sync is not configured. Please add a valid Client ID in js/google-drive.js");
            return;
        }

        if (gapi.client.getToken() === null) {
            // Prompt the user to select a Google Account and ask for consent to share their data
            // when doing a permission request.
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            // Skip request if already valid, but usually we just request again to be sure or check expiry
            this.tokenClient.requestAccessToken({ prompt: '' });
        }
    }

    signOut() {
        const token = gapi.client.getToken();
        if (token !== null) {
            google.accounts.oauth2.revoke(token.access_token);
            gapi.client.setToken('');
            if (this.callbacks.onSignOut) this.callbacks.onSignOut();
        }
    }

    // --- File Operations ---

    async findBackupFile() {
        try {
            const response = await gapi.client.drive.files.list({
                q: "name = 'csg_backup.json' and trashed = false",
                fields: 'files(id, name)',
                spaces: 'drive'
            });
            const files = response.result.files;
            if (files && files.length > 0) {
                return files[0].id;
            }
            return null;
        } catch (err) {
            console.error('Error finding file', err);
            return null;
        }
    }

    async createBackupFile(data) {
        const fileContent = JSON.stringify(data);
        const file = new Blob([fileContent], { type: 'application/json' });
        const metadata = {
            'name': 'csg_backup.json',
            'mimeType': 'application/json'
        };

        const accessToken = gapi.client.getToken().access_token;
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form
        });
    }

    async updateBackupFile(fileId, data) {
        const fileContent = JSON.stringify(data);
        const file = new Blob([fileContent], { type: 'application/json' });
        const metadata = {
            'mimeType': 'application/json'
        };

        const accessToken = gapi.client.getToken().access_token;
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
            method: 'PATCH',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form
        });
    }

    async loadBackupFile(fileId) {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        return response.result; // This is the JSON object
    }

    async sync(localData) {
        if (!this.accessToken) return;

        const fileId = await this.findBackupFile();
        if (fileId) {
            // Found existing. Strategy: Overwrite Cloud with Local? Or Merge?
            // For this simple "Sync" (Backup), we will assume Local is master if used recently, 
            // OR we can just offer "Upload" and "Download" options.
            // Let's implement a simple "Download" first check on connect.

            // For now, let's just return the remote data so logic can decide
            const remoteData = await this.loadBackupFile(fileId);
            return { hasRemote: true, data: remoteData, fileId: fileId };
        } else {
            // No remote file.
            return { hasRemote: false };
        }
    }

    async saveToCloud(data) {
        const fileId = await this.findBackupFile();
        if (fileId) {
            await this.updateBackupFile(fileId, data);
        } else {
            await this.createBackupFile(data);
        }
        console.log('Saved to Drive');
    }
}
