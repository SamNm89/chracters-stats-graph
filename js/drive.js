const CLIENT_ID = '422487925462-sjl9obqg89942k80ntm127d0uvmh2fui.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const API_KEY = ''; // Optional but recommended
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

export class GoogleDriveSync {
    constructor(callbacks) {
        this.tokenClient = null;
        this.callbacks = callbacks || {};
        this.isInitialized = false;
        this.saveFileName = 'save.json';
    }

    loadScripts() {
        return new Promise((resolve) => {
            if (window.gapi && window.google) return resolve();
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
        await new Promise((resolve) => gapi.load('client', resolve));

        // Init GAPI Client with Discovery Docs (API Key optional)
        const gapiConfig = {
            discoveryDocs: [DISCOVERY_DOC],
        };
        if (API_KEY) {
            gapiConfig.apiKey = API_KEY;
        }
        await gapi.client.init(gapiConfig);

        // Init Token Client (Identity Services)
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
                if (tokenResponse.error !== undefined) {
                    console.error(tokenResponse);
                    return;
                }
                // CRITICAL: Set the token for GAPI client
                gapi.client.setToken(tokenResponse);

                localStorage.setItem('csg_drive_connected', 'true');
                if (this.callbacks.onSignIn) this.callbacks.onSignIn();
            },
        });

        this.isInitialized = true;

        // Try silent re-auth if previously connected
        if (localStorage.getItem('csg_drive_connected') === 'true') {
            try {
                // Check if we have a valid token or need to request one
                // gapi.client.getToken() might be null initially
                // We can't easily "silent re-auth" with prompt:none effectively without a hint
                // But we can check if gapi client has a token if we persisted it (we didn't).
                // Standard pattern is to ask for token with prompt='' or check session.
                // For now, let's wait for user action or assume session might be active.
                // Actually, the new Identity Services requires a new token request.
                // We can try immediate request if we think we are connected.
                // this.tokenClient.requestAccessToken({ prompt: 'none' }); // Often fails without hint
            } catch(e) { console.log(e); }
        }
    }

    handleAuthClick() {
        if (!this.isInitialized) {
            alert("Google Sync is not configured. Please add a valid Client ID in the script.");
            return;
        }

        // Always request a new token to ensure validity
        this.tokenClient.requestAccessToken({ prompt: '' });
    }

    get isSignedIn() {
        return window.gapi && gapi.client && gapi.client.getToken() !== null;
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
                q: `name = '${this.saveFileName}'`,
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
        if (!this.isSignedIn) return;
        if (this.callbacks.onSyncStart) this.callbacks.onSyncStart();

        try {
            let file = await this.findBackupFile();
            let fileId = file ? file.id : null;

            if (!fileId) {
                // Create file
                const createRes = await gapi.client.drive.files.create({
                    resource: {
                        name: this.saveFileName,
                        parents: ['appDataFolder']
                    },
                    fields: 'id',
                });
                fileId = createRes.result.id;
            }

            // Update content
            await gapi.client.request({
                path: `/upload/drive/v3/files/${fileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body: JSON.stringify(data)
            });

            // Update local state for sync tracking
            localStorage.setItem('csg_last_sync', new Date().toISOString());
            localStorage.setItem('csg_is_dirty', 'false');
            console.log('Saved to Drive (AppData)');

            if (this.callbacks.onSyncComplete) this.callbacks.onSyncComplete();

        } catch (e) {
            console.error("Save to Cloud failed:", e);
        }
    }

    async loadFromCloud() {
        if (!this.isSignedIn) return null;
        try {
            const file = await this.findBackupFile();
            if (!file) return null;

            const response = await gapi.client.drive.files.get({
                fileId: file.id,
                alt: 'media'
            });

            return {
                data: response.result,
                metadata: file
            };
        } catch(e) {
            console.error("Load from Cloud failed:", e);
            return null;
        }
    }
}
