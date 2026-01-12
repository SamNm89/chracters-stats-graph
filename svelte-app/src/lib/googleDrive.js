// Google Sync Logic
// This logic is mostly imperative and callback based as per the original app.js
// We will wrap it in a class that can be used by the Svelte components.

const CLIENT_ID = '422487925462-sjl9obqg89942k80ntm127d0uvmh2fui.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

export class GoogleDriveSync {
    constructor(callbacks) {
        this.tokenClient = null;
        this.accessToken = null;
        this.callbacks = callbacks || {};
        this.isInitialized = false;
    }

    loadScripts() {
        return new Promise((resolve) => {
            if (window.gapi && window.google) return resolve();
            // Scripts are loaded in index.html, we just wait for them to be ready
            // But checking for window.gapi and window.google might not be enough if they are async loading
            // In index.html we added them. Let's assume they load fast or we wait a bit.

            // Actually, best practice is to wait for onload.
            // Since we added them in index.html, we might need to check if they are available.
            const check = setInterval(() => {
                if (window.gapi && window.google) {
                    clearInterval(check);
                    resolve();
                }
            }, 100);
        });
    }

    async init() {
        if (!CLIENT_ID) {
            console.warn('Google Sync: No Client ID provided.');
            return;
        }

        await this.loadScripts();
        await new Promise((resolve) => gapi.load('client', resolve));
        await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });

        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
                if (tokenResponse.error !== undefined) {
                    if (tokenResponse.error === 'interaction_required') {
                        console.log('Silent re-auth failed, interaction required.');
                        localStorage.removeItem('csg_drive_connected');
                        if (this.callbacks.onSignedOut) this.callbacks.onSignedOut();
                        return;
                    }
                    throw tokenResponse;
                }
                this.accessToken = tokenResponse.access_token;
                localStorage.setItem('csg_drive_connected', 'true');
                if (this.callbacks.onSignIn) this.callbacks.onSignIn();
            },
        });
        this.isInitialized = true;

        // Try silent re-auth if previously connected
        if (localStorage.getItem('csg_drive_connected') === 'true') {
            console.log('Attempting silent re-auth...');
            this.tokenClient.requestAccessToken({ prompt: 'none' });
        }
    }

    handleAuthClick() {
        if (!this.isInitialized) {
            alert("Google Sync is not configured properly or initializing.");
            return;
        }
        if (gapi.client.getToken() === null) {
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            this.tokenClient.requestAccessToken({ prompt: '' });
        }
    }

    async getUserProfile() {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            return await response.json();
        } catch (err) {
            console.error('Error fetching user profile', err);
            return null;
        }
    }

    async findBackupFile() {
        try {
            const response = await gapi.client.drive.files.list({
                q: "name = 'csg_data.json' and trashed = false",
                fields: 'files(id, name, modifiedTime)',
                spaces: 'appDataFolder'
            });
            const files = response.result.files;
            return (files && files.length > 0) ? files[0] : null;
        } catch (err) {
            console.error('Error finding file', err);
            return null;
        }
    }

    async downloadFile(fileId) {
        try {
            const response = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            return response.result;
        } catch (err) {
            console.error('Error downloading file', err);
            return null;
        }
    }

    async saveToCloud(data) {
        const fileObj = await this.findBackupFile();
        const fileId = fileObj ? fileObj.id : null;

        const fileContent = JSON.stringify(data);
        const file = new Blob([fileContent], { type: 'application/json' });
        const metadata = {
            'name': 'csg_data.json',
            'mimeType': 'application/json',
            'parents': ['appDataFolder']
        };
        const accessToken = gapi.client.getToken().access_token;
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        const url = fileId
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
            : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&spaces=appDataFolder`;

        await fetch(url, {
            method: fileId ? 'PATCH' : 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form
        });

        console.log('Saved to Drive appDataFolder');
    }

    signOut() {
        if (gapi.client.getToken()) {
            google.accounts.oauth2.revoke(gapi.client.getToken().access_token, () => {
                gapi.client.setToken(null);
                localStorage.removeItem('csg_drive_connected');
                if (this.callbacks.onSignedOut) this.callbacks.onSignedOut();
            });
        } else {
            localStorage.removeItem('csg_drive_connected');
            if (this.callbacks.onSignedOut) this.callbacks.onSignedOut();
        }
    }
}
