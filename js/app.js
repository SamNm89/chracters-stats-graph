/**
 * Unified App Script for Local file:// Compatibility
 * Feature Update: Multi-Series Support
 */

/* =========================================
   1. STATE MANAGEMENT (Refactored for Series)
   ========================================= */
class State {
    constructor() {
        this.storageKey = 'csg_data_v2'; // Bump version
        this.data = this.load() || this.createDefault();

        // Ensure format migration if needed (simple check)
        if (!this.data.series) {
            // Migrating v1 to v2 structure
            const oldData = this.data;
            this.data = {
                activeSeriesId: 'default',
                series: {
                    'default': {
                        name: 'My First Series',
                        settings: oldData.settings || { dimensions: 3, tiers: ['F', 'B', 'A', 'S'] },
                        characters: oldData.characters || []
                    }
                }
            };
            this.save();
        }
    }

    createDefault() {
        return {
            activeSeriesId: 'default',
            lastUpdated: Date.now(),
            series: {
                'default': {
                    name: 'My First Series',
                    settings: {
                        dimensions: 3,
                        tiers: ['F', 'B', 'A', 'S']
                    },
                    characters: []
                }
            }
        };
    }

    load() {
        try {
            // Check v2 key first
            let json = localStorage.getItem('csg_data_v2');
            if (json) return JSON.parse(json);

            // Check v1 key
            json = localStorage.getItem('csg_data_v1');
            if (json) {
                // Return simple object, constructor will migrate it
                return JSON.parse(json);
            }
            return null;
        } catch (e) {
            console.error("Load failed", e);
            return null;
        }
    }

    save() {
        this.data.lastUpdated = Date.now();
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    }

    // --- Series Helpers ---

    get activeSeries() {
        return this.data.series[this.data.activeSeriesId];
    }

    getSeriesList() {
        return Object.keys(this.data.series).map(id => ({
            id,
            name: this.data.series[id].name
        }));
    }

    createSeries(name) {
        const id = crypto.randomUUID();
        this.data.series[id] = {
            name: name,
            settings: { dimensions: 3, tiers: ['F', 'B', 'A', 'S'] },
            characters: []
        };
        this.data.activeSeriesId = id;
        this.save();
        return id;
    }

    switchSeries(id) {
        if (this.data.series[id]) {
            this.data.activeSeriesId = id;
            this.save();
        }
    }

    updateSeriesName(id, name) {
        if (this.data.series[id]) {
            this.data.series[id].name = name;
            this.save();
        }
    }

    deleteSeries(id) {
        // Can't delete the last one
        if (Object.keys(this.data.series).length <= 1) return false;

        delete this.data.series[id];
        // If we deleted active, switch to another
        if (this.data.activeSeriesId === id) {
            this.data.activeSeriesId = Object.keys(this.data.series)[0];
        }
        this.save();
        return true;
    }

    // --- Active Series Methods ---

    get settings() { return this.activeSeries.settings; }

    updateSettings(dimensions, tiers, statNames) {
        const oldDim = this.activeSeries.settings.dimensions;

        // Migration logic if dimensions changed arbitrarily (e.g. from a bulk update)
        if (dimensions !== oldDim) {
            this.activeSeries.characters.forEach(char => {
                if (!char.stats) char.stats = [];
                if (dimensions > oldDim) {
                    const diff = dimensions - oldDim;
                    for (let i = 0; i < diff; i++) char.stats.push(0);
                } else {
                    char.stats = char.stats.slice(0, dimensions);
                }
            });
        }

        this.activeSeries.settings.dimensions = dimensions;
        this.activeSeries.settings.tiers = tiers;
        if (statNames) this.activeSeries.settings.statNames = statNames;
        this.save();
    }

    insertStat(index, name = "New Stat") {
        const s = this.activeSeries;
        s.settings.dimensions++;
        if (!s.settings.statNames) {
            s.settings.statNames = new Array(s.settings.dimensions - 1).fill("").map((_, i) => `Stat ${i + 1}`);
        }
        s.settings.statNames.splice(index, 0, name);

        s.characters.forEach(char => {
            if (!char.stats) char.stats = [];
            char.stats.splice(index, 0, 0);
        });
        this.save();
    }

    removeStat(index) {
        const s = this.activeSeries;
        if (s.settings.dimensions <= 3) return;

        s.settings.dimensions--;
        if (s.settings.statNames) {
            s.settings.statNames.splice(index, 1);
        }

        s.characters.forEach(char => {
            if (char.stats) char.stats.splice(index, 1);
        });
        this.save();
    }

    getCharacters() { return this.activeSeries.characters; }

    getCharacter(id) { return this.activeSeries.characters.find(c => c.id === id); }

    saveCharacter(charData) {
        if (!charData.id) {
            charData.id = crypto.randomUUID();
            this.activeSeries.characters.push(charData);
        } else {
            const idx = this.activeSeries.characters.findIndex(c => c.id === charData.id);
            if (idx !== -1) this.activeSeries.characters[idx] = charData;
        }
        this.save();
        return charData.id;
    }

    deleteCharacter(id) {
        this.activeSeries.characters = this.activeSeries.characters.filter(c => c.id !== id);
        this.save();
    }
}

/* =========================================
   2. GRAPH ENGINE (SVG) - Unchanged Logic
   ========================================= */
class Graph {
    constructor(svgElement) {
        this.svg = svgElement;
        this.width = 800;  // Increased internal coordinate space
        this.height = 800;
        this.center = { x: 400, y: 400 };
        this.radius = 180;
        this.settings = null;
        this.currentStats = [];
        this.svg.setAttribute('viewBox', `0 0 800 800`);
    }

    init(settings) {
        this.settings = settings;
        this.dimensions = settings.dimensions;

        // Use smaller radius relative to 800px space to ensure labels fit
        this.radius = this.width > 300 ? 220 : 60;

        this.currentStats = new Array(settings.dimensions).fill(0);
        this.drawGrid();
        this.drawShape(this.currentStats);
    }

    drawGrid() {
        this.svg.innerHTML = '';

        // Create Layer Groups
        this.gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.polyGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.labelsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.labelsGroup.setAttribute('class', 'chart-labels');

        this.svg.appendChild(this.gridGroup);
        this.svg.appendChild(this.polyGroup);
        this.svg.appendChild(this.labelsGroup);

        const N = this.settings.dimensions;
        const tiers = this.settings.tiers;
        const tierCount = tiers.length - 1;

        for (let i = tierCount; i >= 0; i--) {
            const fraction = (i + 1) / tiers.length;
            const points = this.getPolygonPoints(N, this.radius * fraction);
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', mapPoints(points));
            poly.setAttribute('class', i === tierCount ? 'graph-web outer' : 'graph-web inner');
            this.gridGroup.appendChild(poly);
        }

        const outerPoints = this.getPolygonPoints(N, this.radius);
        outerPoints.forEach((p) => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', this.center.x);
            line.setAttribute('y1', this.center.y);
            line.setAttribute('x2', p.x);
            line.setAttribute('y2', p.y);
            line.setAttribute('class', 'graph-axis');
            this.gridGroup.appendChild(line);
        });
    }

    drawLabels(stats) {
        if (!this.labelsGroup) return;
        this.labelsGroup.innerHTML = '';

        const statNames = this.settings.statNames || [];
        const tiers = this.settings.tiers;

        // Increased distance between Tier and Name to prevent overlap on horizontal axes
        const radiusTier = this.radius + 15;
        const radiusName = this.radius + 65;

        for (let i = 0; i < this.dimensions; i++) {
            const angle = -Math.PI / 2 + (Math.PI * 2 * i) / this.dimensions;
            const statVal = stats ? (stats[i] || 0) : 0;
            const tierLabel = tiers[statVal] || '';
            const nameLabel = statNames[i] || `Stat ${i + 1}`;

            // Helper to anchor text based on angle
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const align = (Math.abs(cos) < 0.1) ? 'middle' : (cos > 0 ? 'start' : 'end');
            const baseline = (Math.abs(sin) < 0.1) ? 'middle' : (sin > 0 ? 'hanging' : 'baseline');

            // 1. Tier Label (Inner)
            const tx = this.center.x + radiusTier * cos;
            const ty = this.center.y + radiusTier * sin;
            this.drawText(tx, ty, tierLabel, this.labelsGroup, 'label-tier', align, baseline);

            // 2. Name Label (Outer)
            // To prevent horizontal overlap with tier when labels are long on the sides:
            // If we are strictly horizontal, we can offset the Name Y slightly.
            const nx = this.center.x + radiusName * cos;
            const ny = this.center.y + radiusName * sin;

            this.drawText(nx, ny, nameLabel, this.labelsGroup, 'label-name', align, baseline);
        }
    }

    drawText(x, y, text, parent, className, align, baseline) {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', x);
        t.setAttribute('y', y);
        t.setAttribute('class', className);
        t.setAttribute('text-anchor', align);
        t.setAttribute('dominant-baseline', baseline);
        t.textContent = text;
        parent.appendChild(t);
    }

    getPolygonPoints(sides, r) {
        const points = [];
        const angleStep = (Math.PI * 2) / sides;
        const startAngle = -Math.PI / 2;
        for (let i = 0; i < sides; i++) {
            const angle = startAngle + (i * angleStep);
            points.push({
                x: this.center.x + r * Math.cos(angle),
                y: this.center.y + r * Math.sin(angle)
            });
        }
        return points;
    }

    drawShape(stats) {
        // Ensure groups exist if accidentally wiped (safety)
        if (!this.polyGroup) this.drawGrid();

        let shape = this.polyGroup.querySelector('.graph-shape');
        if (!shape) {
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            shape.setAttribute('class', 'graph-shape');
            this.polyGroup.appendChild(shape);
        }
        const pointsString = this.calculateShapeString(stats);
        shape.setAttribute('points', pointsString);

        this.polyGroup.querySelectorAll('.graph-dot').forEach(el => el.remove());
        const coords = this.getStatCoords(stats);
        coords.forEach(p => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', p.x);
            circle.setAttribute('cy', p.y);
            circle.setAttribute('r', 4);
            circle.setAttribute('class', 'graph-dot');
            this.polyGroup.appendChild(circle);
        });
    }

    getStatCoords(stats) {
        const N = this.settings.dimensions;
        const tiers = this.settings.tiers;
        const angleStep = (Math.PI * 2) / N;
        const startAngle = -Math.PI / 2;

        return stats.map((val, i) => {
            // Map 0 -> 0 (center), Max -> 1 (edge)
            // tiers.length - 1 is the max index
            const maxIndex = Math.max(1, tiers.length - 1);
            const fraction = val / maxIndex;

            const r = this.radius * fraction;
            const angle = startAngle + (i * angleStep);
            return {
                x: this.center.x + r * Math.cos(angle),
                y: this.center.y + r * Math.sin(angle)
            };
        });
    }

    calculateShapeString(stats) {
        const coords = this.getStatCoords(stats);
        return mapPoints(coords);
    }

    animateTo(targetStats) {
        // Update Labels immediately
        this.drawLabels(targetStats);

        const startStats = [...this.currentStats];
        while (startStats.length < targetStats.length) startStats.push(0);

        const startTime = performance.now();
        const duration = 400;
        const loop = (t) => {
            const elapsed = t - startTime;
            const p = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - p, 3);
            const interp = startStats.map((s, i) => {
                const end = targetStats[i] !== undefined ? targetStats[i] : 0;
                return s + (end - s) * ease;
            });
            this.drawShape(interp);
            if (p < 1) requestAnimationFrame(loop);
            else this.currentStats = targetStats;
        };
        requestAnimationFrame(loop);
    }
}
function mapPoints(arr) { return arr.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '); }

/* =========================================
   3. GOOGLE SYNC & APP CONTROLLER
   ========================================= */
const CLIENT_ID = '422487925462-sjl9obqg89942k80ntm127d0uvmh2fui.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';
const API_KEY = ''; // Optional
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

class GoogleDriveSync {
    constructor(callbacks) {
        this.tokenClient = null;
        this.accessToken = null;
        this.callbacks = callbacks || {};
        this.isInitialized = false;
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
        await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });

        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
                if (tokenResponse.error !== undefined) {
                    if (tokenResponse.error === 'interaction_required') {
                        // Silent re-auth failed, user needs to click button manually
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
            alert("Google Sync is not configured. Please add a valid Client ID in the script.");
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

        // Update local state for sync tracking
        localStorage.setItem('csg_last_sync', new Date().toISOString());
        localStorage.setItem('csg_is_dirty', 'false');

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

// Global UI Elements map
const els = {
    charList: document.getElementById('character-list'),
    svg: document.getElementById('stat-graph'),
    activeName: document.getElementById('active-name'),
    activeImageContainer: document.getElementById('active-image-container'),
    editorPanel: document.getElementById('editor-panel'),
    editName: document.getElementById('edit-name'),
    editImage: document.getElementById('edit-image'),
    statSliders: document.getElementById('stat-sliders'),
    saveBtn: document.getElementById('save-char-btn'),
    deleteBtn: document.getElementById('delete-char-btn'),
    closeEditor: document.getElementById('close-editor'),
    editBg: document.getElementById('edit-bg'),
    graphContainer: document.getElementById('graph-container'),
    addBtn: document.getElementById('add-char-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    syncBtn: document.getElementById('sync-btn'),
    dataModal: document.getElementById('data-modal'),
    openDataModalBtn: document.getElementById('open-data-modal-btn'),
    closeDataModal: document.getElementById('close-data-modal'),
    exportJsonBtn: document.getElementById('export-json-btn'),
    importJsonBtn: document.getElementById('import-json-btn'),
    importInput: document.getElementById('import-input'),
    syncStatusIndicator: document.getElementById('sync-status-indicator'),
    syncDetails: document.getElementById('sync-details'),
    lastSyncTime: document.getElementById('last-sync-time'),
    syncStatusText: document.getElementById('sync-status-text'),
    syncUserEmail: document.getElementById('sync-user-email'),
    signOutBtn: document.getElementById('sign-out-btn'),
    driveCard: document.querySelector('.drive-card'),
    // Settings    // Modals
    settingsModal: document.getElementById('settings-modal'),
    settingVertices: document.getElementById('setting-vertices'),
    settingTiers: document.getElementById('setting-tiers'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    cancelSettingsBtn: document.getElementById('cancel-settings-btn'),
    // Settings Preview
    settingMiniGraph: document.getElementById('settings-mini-graph'),
    settingStatNames: document.getElementById('settings-stat-names'),

    // Series
    seriesBtn: document.getElementById('series-btn'),
    seriesNameLabel: document.getElementById('current-series-name'),
    seriesModal: document.getElementById('series-modal'),
    seriesList: document.getElementById('series-list'),
    newSeriesInput: document.getElementById('new-series-name'),
    createSeriesBtn: document.getElementById('create-series-btn'),
    closeSeriesModal: document.getElementById('close-series-modal'),
    importSeriesBtn: document.getElementById('import-series-btn'),
    importSeriesInput: document.getElementById('import-series-input'),
    // Edit Current
    editCurrentBtn: document.getElementById('edit-current-btn'),

    // Import Review
    importReviewModal: document.getElementById('import-review-modal'),
    importReviewList: document.getElementById('import-review-list'),
    confirmImportBtn: document.getElementById('confirm-import-btn'),
    cancelImportBtn: document.getElementById('cancel-import-btn'),
};

const App = {
    init() {
        this.state = new State();
        this.graph = new Graph(els.svg);
        this.miniGraph = new Graph(els.settingMiniGraph);

        // Initialize Drive Sync
        this.drive = new GoogleDriveSync({
            onSignIn: () => {
                this.updateSyncUI();
                this.checkSyncConflict();
            },
            onSignedOut: () => {
                this.updateSyncUI();
            }
        });
        this.drive.init();
        // Mini graph needs smaller scale
        this.miniGraph.width = 150;
        this.miniGraph.height = 150;
        this.miniGraph.center = { x: 75, y: 75 };
        this.miniGraph.radius = 60;
        this.miniGraph.svg.setAttribute('viewBox', '0 0 150 150');

        this.editingId = null;

        this.bindEvents();
        this.refreshSeriesUI(); // Load series
    },

    bindEvents() {
        // Edit Current
        if (els.editCurrentBtn) {
            els.editCurrentBtn.onclick = () => {
                if (this.state.activeCharId) this.openEditor(this.state.activeCharId);
            };
        }

        // Series
        els.seriesBtn.onclick = () => {
            this.renderSeriesList();
            els.seriesModal.classList.remove('hidden');
        };
        els.closeSeriesModal.onclick = () => els.seriesModal.classList.add('hidden');
        els.createSeriesBtn.onclick = () => {
            const name = els.newSeriesInput.value.trim();
            if (name) {
                this.state.createSeries(name);
                els.newSeriesInput.value = '';
                this.refreshSeriesUI();
                els.seriesModal.classList.add('hidden');
            }
        };
        els.importSeriesBtn.onclick = () => els.importSeriesInput.click();
        els.importSeriesInput.onchange = (e) => this.importSeries(e);

        // Chars
        els.addBtn.onclick = () => this.openEditor(null);
        els.closeEditor.onclick = () => els.editorPanel.classList.add('hidden');
        els.saveBtn.onclick = () => this.saveCharacter();
        els.deleteBtn.onclick = () => this.deleteCharacter();

        // Settings
        els.settingsBtn.onclick = () => {
            this.settingsEditMode = 'add'; // Default mode
            this.openSettingsModal();
        };

        // Mode Toggles
        const modeAddBtn = document.getElementById('mode-add-btn');
        const modeRemoveBtn = document.getElementById('mode-remove-btn');
        const previewContainer = document.getElementById('settings-preview-container');

        if (modeAddBtn && modeRemoveBtn) {
            modeAddBtn.onclick = () => {
                this.settingsEditMode = 'add';
                modeAddBtn.classList.add('active');
                modeRemoveBtn.classList.remove('active');
                previewContainer.className = 'mode-add';
            };
            modeRemoveBtn.onclick = () => {
                this.settingsEditMode = 'remove';
                modeRemoveBtn.classList.add('active');
                modeAddBtn.classList.remove('active');
                previewContainer.className = 'mode-remove';
            };
        }

        els.cancelSettingsBtn.onclick = () => this.closeSettingsModal();
        els.saveSettingsBtn.onclick = () => {
            if (!this.settingsDraft) return;

            // SAFETY: Ensure we are still editing the same series we started with
            if (this.settingsDraftId !== this.state.data.activeSeriesId) {
                console.error("Series changed while editing settings. Discarding draft.");
                this.closeSettingsModal();
                return;
            }

            const tiers = els.settingTiers.value.split(',').map(s => s.trim()).filter(Boolean);
            const names = [];
            document.querySelectorAll('#settings-preview-container .stat-name-input-wrapper input').forEach(inp => {
                names.push(inp.value.trim() || inp.placeholder);
            });

            // Apply draft to permanent state
            this.settingsDraft.settings.tiers = tiers;
            this.settingsDraft.settings.statNames = names;

            // Merge the draft back into the state
            this.state.data.series[this.state.data.activeSeriesId] = this.settingsDraft;
            this.state.save();

            this.closeSettingsModal();
            this.refreshGraph();
        };

        els.syncBtn.onclick = () => {
            this.drive.handleAuthClick();
        };
        els.signOutBtn.onclick = () => {
            if (confirm("Sign out from Google Drive?")) {
                this.drive.signOut();
            }
        };

        els.importInput.onchange = (e) => this.importData(e);

        // Auto-sync listener (Mark as dirty on change)
        const originalSave = this.state.save.bind(this.state);
        this.state.save = () => {
            originalSave();
            localStorage.setItem('csg_is_dirty', 'true');
            this.triggerAutoSync();
        };

        // UI Refresh on Modal Open
        els.openDataModalBtn.onclick = () => {
            this.updateSyncUI();
            els.dataModal.classList.remove('hidden');
        };

        els.closeDataModal.onclick = () => els.dataModal.classList.add('hidden');
        els.exportJsonBtn.onclick = () => this.exportData();
        els.importJsonBtn.onclick = () => els.importInput.click();

        // Outside Click Handlers (Strict: Start and End on backdrop to close)
        [els.settingsModal, els.seriesModal, els.dataModal, els.importReviewModal].forEach(modal => {
            let startedOnBackdrop = false;

            modal.onmousedown = (e) => {
                startedOnBackdrop = (e.target === modal);
            };

            modal.onmouseup = (e) => {
                if (startedOnBackdrop && e.target === modal) {
                    if (modal === els.settingsModal) {
                        this.closeSettingsModal();
                    } else {
                        modal.classList.add('hidden');
                    }
                }
                startedOnBackdrop = false; // reset
            };
        });
        this.settingsDraft = null;
        this.settingsDraftId = null;

        // Keyboard Navigation
        window.addEventListener('keydown', (e) => {
            // Global Escape to close active modals
            if (e.key === 'Escape') {
                const activeModals = [els.settingsModal, els.seriesModal, els.dataModal, els.importReviewModal];
                activeModals.forEach(modal => {
                    if (!modal.classList.contains('hidden')) {
                        if (modal === els.settingsModal) {
                            this.closeSettingsModal();
                        } else {
                            modal.classList.add('hidden');
                        }
                    }
                });
            }

            if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
                // Don't navigate if user is typing in an input
                if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

                e.preventDefault();
                const chars = this.state.getCharacters();
                if (chars.length === 0) return;

                let idx = chars.findIndex(c => c.id === this.state.activeCharId);

                if (e.key === 'ArrowUp') {
                    idx = (idx <= 0) ? chars.length - 1 : idx - 1;
                } else if (e.key === 'ArrowDown') {
                    idx = (idx === -1 || idx >= chars.length - 1) ? 0 : idx + 1;
                }

                this.selectCharacter(chars[idx].id);
            }
        });
    },

    openSettingsModal() {
        // Track which series this draft belongs to
        this.settingsDraftId = this.state.data.activeSeriesId;
        this.settingsDraft = JSON.parse(JSON.stringify(this.state.activeSeries));

        const s = this.settingsDraft.settings;
        els.settingTiers.value = s.tiers.join(',');
        document.getElementById('settings-preview-container').className = 'mode-add';
        document.getElementById('mode-add-btn').classList.add('active');
        document.getElementById('mode-remove-btn').classList.remove('active');

        this.renderSettingsPreview();
        els.settingsModal.classList.remove('hidden');
    },

    closeSettingsModal() {
        this.settingsDraft = null;
        this.settingsDraftId = null;
        els.settingsModal.classList.add('hidden');
    },

    // Helper functions for the draft mode (No saving!)
    _insertStatInDraft(index, name = "New Stat") {
        const s = this.settingsDraft;
        s.settings.dimensions++;
        if (!s.settings.statNames) {
            s.settings.statNames = new Array(s.settings.dimensions - 1).fill("").map((_, i) => `Stat ${i + 1}`);
        }
        s.settings.statNames.splice(index, 0, name);
        s.characters.forEach(char => {
            if (!char.stats) char.stats = [];
            char.stats.splice(index, 0, 0);
        });
    },

    _removeStatFromDraft(index) {
        const s = this.settingsDraft;
        if (s.settings.dimensions <= 3) return;
        s.settings.dimensions--;
        if (s.settings.statNames) s.settings.statNames.splice(index, 1);
        s.characters.forEach(char => {
            if (char.stats) char.stats.splice(index, 1);
        });
    },

    renderSettingsPreview() {
        if (!this.settingsDraft) return;
        const dim = this.settingsDraft.settings.dimensions;
        const existingNames = this.settingsDraft.settings.statNames || [];
        const container = document.getElementById('settings-preview-container');

        // Draw Mini Graph
        this.miniGraph.width = 200;
        this.miniGraph.height = 200;
        this.miniGraph.center = { x: 100, y: 100 };
        this.miniGraph.radius = 80;
        this.miniGraph.svg.setAttribute('viewBox', '0 0 200 200');
        this.miniGraph.init({ dimensions: dim, tiers: [''] });
        this.miniGraph.drawGrid();

        // Clear UI overlays
        container.querySelectorAll('.stat-name-input-wrapper, .add-hitbox').forEach(el => el.remove());

        const angleStep = (Math.PI * 2) / dim;
        const startAngle = -Math.PI / 2;
        const inputRadius = 130;

        for (let i = 0; i < dim; i++) {
            const angle = startAngle + (i * angleStep);

            // 1. Stat Name Input
            const x = Math.cos(angle) * inputRadius;
            const y = Math.sin(angle) * inputRadius;

            const wrapper = document.createElement('div');
            wrapper.className = 'stat-name-input-wrapper';
            wrapper.style.left = `calc(50% + ${x}px)`;
            wrapper.style.top = `calc(50% + ${y}px)`;

            const inp = document.createElement('input');
            inp.type = "text";
            inp.placeholder = `Stat ${i + 1}`;
            inp.value = existingNames[i] || "";
            inp.onclick = (e) => {
                if (this.settingsEditMode === 'remove') {
                    e.stopPropagation();
                    this._removeStatFromDraft(i);
                    this.renderSettingsPreview();
                }
            };

            wrapper.appendChild(inp);
            container.appendChild(wrapper);

            // 2. Add Hitbox (Between this stat and the next)
            const midAngle = angle + (angleStep / 2);
            const hx = Math.cos(midAngle) * 80; // on the spider axis radius
            const hy = Math.sin(midAngle) * 80;

            const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            hitbox.setAttribute('class', 'add-hitbox');
            hitbox.innerHTML = `
                <circle cx="${100 + hx}" cy="${100 + hy}" r="25" fill="transparent" style="cursor: pointer;" />
                <circle class="add-hitbox-marker" cx="${100 + hx}" cy="${100 + hy}" r="8" />
                <text x="${100 + hx}" y="${100 + hy + 4}" font-size="10" text-anchor="middle" fill="white" font-weight="bold" pointer-events="none">+</text>
            `;
            hitbox.onclick = () => {
                if (this.settingsEditMode === 'add') {
                    this._insertStatInDraft(i + 1);
                    this.renderSettingsPreview();
                }
            };
            this.miniGraph.svg.appendChild(hitbox);
        }
    },

    refreshSeriesUI() {
        // Update Title
        els.seriesNameLabel.innerText = this.state.activeSeries.name;

        // Refresh Graph & List for this series
        this.refreshGraph();
        this.renderList();

        // Clear active char view
        this.renderEmptyState();
    },

    renderSeriesList() {
        els.seriesList.innerHTML = '';
        const list = this.state.getSeriesList();
        list.forEach(s => {
            const item = document.createElement('div');
            item.className = `series-item ${s.id === this.state.data.activeSeriesId ? 'active' : ''}`;

            const titleBtn = document.createElement('button');
            titleBtn.className = 'series-item-name';
            titleBtn.innerText = s.name;
            titleBtn.onclick = () => {
                this.state.switchSeries(s.id);
                this.refreshSeriesUI();
                els.seriesModal.classList.add('hidden');
            };

            const actions = document.createElement('div');
            actions.className = 'series-item-actions';

            // 1. Rename
            const editBtn = document.createElement('button');
            editBtn.className = 'icon-btn xs-btn';
            editBtn.innerHTML = '✎';
            editBtn.title = "Rename Series";
            editBtn.onclick = (e) => {
                e.stopPropagation();
                const newName = prompt("Enter new name for the series:", s.name);
                if (newName && newName.trim() !== "") {
                    this.state.updateSeriesName(s.id, newName.trim());
                    this.renderSeriesList();
                    if (s.id === this.state.data.activeSeriesId) {
                        els.seriesNameLabel.innerText = newName.trim();
                    }
                }
            };

            // 2. Export
            const exportBtn = document.createElement('button');
            exportBtn.className = 'icon-btn xs-btn';
            exportBtn.innerHTML = '📤';
            exportBtn.title = "Export Series";
            exportBtn.onclick = (e) => {
                e.stopPropagation();
                this.exportSeries(s.id);
            };

            // 3. Delete
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn xs-btn del-btn';
            delBtn.innerHTML = '🗑️';
            delBtn.title = "Delete Series";
            delBtn.onclick = (e) => {
                e.stopPropagation();
                const confirmName = prompt(`To delete series "${s.name}", please type its name exactly:`);
                if (confirmName === s.name) {
                    if (this.state.deleteSeries(s.id)) {
                        this.renderSeriesList();
                        this.refreshSeriesUI();
                    } else {
                        alert("Cannot delete the last series!");
                    }
                } else if (confirmName !== null) {
                    alert("Name didn't match. Deletion cancelled.");
                }
            };

            actions.appendChild(editBtn);
            actions.appendChild(exportBtn);
            actions.appendChild(delBtn);

            item.appendChild(titleBtn);
            item.appendChild(actions);
            els.seriesList.appendChild(item);
        });
    },

    refreshGraph() {
        this.graph.init(this.state.settings);
    },

    renderList() {
        els.charList.innerHTML = '';
        const chars = this.state.getCharacters();
        if (chars.length === 0) {
            els.charList.innerHTML = `<div class="empty-roster">No characters in <br>"${this.state.activeSeries.name}"</div>`;
            return;
        }
        chars.forEach(char => {
            const div = document.createElement('div');
            div.className = `char-item ${this.state.activeCharId === char.id ? 'active' : ''}`;
            const portraitUrl = this.getOptimizedUrl(char.image, { w: 100, h: 100, fit: 'cover' }) || this.getPlaceholder(char.name);

            div.innerHTML = `
                <div class="char-info-row" style="display:flex; align-items:center; gap:10px; flex:1">
                    <img src="${portraitUrl}" 
                         class="char-thumb" 
                         loading="lazy" 
                         onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=random'">
                    <span>${char.name}</span>
                </div>
                <div class="char-actions-row">
                    <button class="icon-btn xs-btn edit-btn" title="Edit">✎</button>
                    <button class="icon-btn xs-btn del-btn" title="Delete">🗑️</button>
                </div>
            `;

            // Selection Click (Main body)
            div.onclick = () => this.selectCharacter(char.id);

            // Action Clicks (Prevent Selection)
            const editBtn = div.querySelector('.edit-btn');
            editBtn.onclick = (e) => {
                e.stopPropagation();
                this.openEditor(char.id);
            };

            const delBtn = div.querySelector('.del-btn');
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Delete ${char.name}?`)) {
                    this.state.deleteCharacter(char.id);
                    if (this.state.activeCharId === char.id) this.renderEmptyState();
                    this.renderList();
                }
            };

            els.charList.appendChild(div);
        });
    },

    renderEmptyState() {
        this.state.activeCharId = null;
        els.activeName.innerText = "Select Character";
        els.activeImageContainer.innerHTML = '';
        this.graph.animateTo(new Array(this.state.settings.dimensions).fill(0));
        if (els.editCurrentBtn) els.editCurrentBtn.classList.add('hidden');
    },

    selectCharacter(id) {
        this.state.activeCharId = id;
        this.renderList(); // highlight active
        const char = this.state.getCharacter(id);
        if (char) {
            els.activeName.innerText = char.name;

            // Portrait Optimization (Max 400px for high DPI)
            const portraitUrl = this.getOptimizedUrl(char.image, { w: 400, h: 400, fit: 'cover' }) ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&size=200&background=random`;

            els.activeImageContainer.innerHTML = `<img src="${portraitUrl}" 
                                                       class="portrait-img" 
                                                       loading="lazy" 
                                                       onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&size=200&background=random'">`;

            // Background Optimization (Higher width, lower quality for performance)
            if (char.bgImage) {
                const optimizedBg = this.getOptimizedUrl(char.bgImage, { w: 1280, q: 60 });
                els.graphContainer.style.backgroundImage = `url('${optimizedBg}')`;
                els.graphContainer.classList.add('has-bg');
            } else {
                els.graphContainer.style.backgroundImage = 'none';
                els.graphContainer.classList.remove('has-bg');
            }

            this.graph.animateTo(char.stats);
            if (els.editCurrentBtn) els.editCurrentBtn.classList.remove('hidden');
        }
    },

    openEditor(id) {
        this.editingId = id;
        els.editorPanel.classList.remove('hidden');
        this.renderEditorInputs(id);
        if (id) {
            const char = this.state.getCharacter(id);
            els.editName.value = char.name;
            els.editImage.value = char.image || '';
            els.editBg.value = char.bgImage || '';
        } else {
            els.editName.value = 'New Character';
            els.editImage.value = '';
            els.editBg.value = '';
        }
    },

    renderEditorInputs(id) {
        els.statSliders.innerHTML = '';
        const count = this.state.settings.dimensions;
        const tiers = this.state.settings.tiers;
        const statNames = this.state.settings.statNames || [];
        const char = id ? this.state.getCharacter(id) : null;
        const stats = char ? char.stats : new Array(count).fill(Math.floor(tiers.length / 2));

        for (let i = 0; i < count; i++) {
            const val = stats[i] !== undefined ? stats[i] : 0;
            const labelName = statNames[i] || `Stat ${i + 1}`;

            const w = document.createElement('div');
            w.className = 'stat-control';
            w.innerHTML = `
                <label>${labelName} <span id="s-lbl-${i}" class="tier-badge">${tiers[val] || ''}</span></label>
                <input type="range" data-idx="${i}" min="0" max="${tiers.length - 1}" value="${val}">
            `;
            els.statSliders.appendChild(w);
        }

        els.statSliders.querySelectorAll('input').forEach(inp => {
            inp.oninput = (e) => {
                const idx = e.target.dataset.idx;
                const v = parseInt(e.target.value);
                document.getElementById(`s-lbl-${idx}`).innerText = tiers[v];
                this.livePreview();
            }
        });
    },

    livePreview() {
        const stats = [];
        els.statSliders.querySelectorAll('input').forEach(i => stats.push(parseInt(i.value)));
        this.graph.animateTo(stats);
    },

    saveCharacter() {
        const stats = [];
        els.statSliders.querySelectorAll('input').forEach(i => stats.push(parseInt(i.value)));
        const data = {
            id: this.editingId,
            name: els.editName.value || 'Unnamed',
            image: els.editImage.value,
            bgImage: els.editBg.value,
            stats: stats
        };
        const savedId = this.state.saveCharacter(data);
        this.selectCharacter(savedId);
        els.editorPanel.classList.add('hidden');
    },

    deleteCharacter() {
        if (this.editingId && confirm("Delete?")) {
            this.state.deleteCharacter(this.editingId);
            els.editorPanel.classList.add('hidden');
            this.refreshSeriesUI();
        }
    },

    getPlaceholder(name) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
    },

    /**
     * Proxies external URLs through images.weserv.nl for:
     * 1. Automatic compression (WebP)
     * 2. Resizing to exact display dimensions
     * 3. Performance (Fast CDN loading)
     */
    getOptimizedUrl(url, options = {}) {
        if (!url || typeof url !== 'string') return null;
        if (!url.startsWith('http')) return url; // Don't proxy base64 or relative paths

        // Strip protocol/leading slashes for weserv
        const cleanUrl = url.replace(/^https?:\/\//, '');

        const params = new URLSearchParams({
            url: cleanUrl,
            noproxy: '1', // Attempt to use original if possible? No, weserv needs to proxy.
            default: url, // Fallback to original if proxy fails
            ...options
        });

        // Use weserv.nl as the transparent optimizer
        return `https://images.weserv.nl/?${params.toString()}`;
    },

    exportData() {
        const dataStr = JSON.stringify(this.state.data, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

        const exportFileDefaultName = `csg_backup_${new Date().toISOString().split('T')[0]}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    },

    isDataDirty() {
        return localStorage.getItem('csg_is_dirty') === 'true';
    },

    triggerAutoSync() {
        if (window.gapi && gapi.client && gapi.client.getToken() && this.isDataDirty()) {
            console.log('Auto-syncing to cloud...');
            this.drive.saveToCloud(this.state.data).then(() => {
                this.updateSyncUI();
            });
        }
    },

    updateSyncUI() {
        const token = window.gapi && gapi.client && gapi.client.getToken();
        const lastSync = localStorage.getItem('csg_last_sync');
        const isDirty = this.isDataDirty();
        const driveCard = document.querySelector('.drive-card');

        if (token) {
            els.syncDetails.classList.remove('hidden');
            els.signOutBtn.classList.remove('hidden');
            els.syncBtn.innerText = 'Sync Now';
            els.syncBtn.classList.add('secondary-btn');
            els.syncBtn.classList.remove('primary-btn');
            if (driveCard) driveCard.classList.add('connected');

            // Fetch and show email if not already there
            if (els.syncUserEmail && (els.syncUserEmail.innerText === 'Not available' || els.syncUserEmail.innerText === '')) {
                this.drive.getUserProfile().then(profile => {
                    if (profile && profile.email) {
                        els.syncUserEmail.innerText = profile.email;
                    }
                });
            }

            if (lastSync) {
                const date = new Date(lastSync);
                // Matches paimon.moe long date format
                const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' };
                els.lastSyncTime.innerText = date.toLocaleDateString(undefined, options);
            }

            if (isDirty) {
                els.syncStatusIndicator.className = 'sync-indicator outdated';
                els.syncStatusIndicator.title = 'Local changes pending sync';
                els.syncStatusText.innerText = 'Outdated';
                els.syncStatusText.style.color = '#f97316';
            } else {
                els.syncStatusIndicator.className = 'sync-indicator synced';
                els.syncStatusIndicator.title = 'Data is up to date in Drive';
                els.syncStatusText.innerText = 'Synced';
                els.syncStatusText.style.color = '#10b981';
            }
        } else {
            els.syncDetails.classList.add('hidden');
            els.signOutBtn.classList.add('hidden');
            els.syncBtn.innerText = 'Connect & Sync';
            els.syncBtn.classList.remove('secondary-btn');
            els.syncBtn.classList.add('primary-btn');
            els.syncStatusIndicator.className = 'sync-indicator';
            if (driveCard) driveCard.classList.remove('connected');
            if (els.syncUserEmail) els.syncUserEmail.innerText = 'Not available';
        }
    },

    exportSeries(id) {
        const series = this.state.data.series[id];
        if (!series) return;

        // Create a single series export object
        const exportObj = {
            version: "v2_single_series",
            name: series.name,
            settings: series.settings,
            characters: series.characters
        };

        const dataStr = JSON.stringify(exportObj, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const filename = `csg_series_${series.name.replace(/\s+/g, '_').toLowerCase()}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', filename);
        linkElement.click();
    },

    importSeries(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);

                // Validate if it's a single series or part of a full backup
                let seriesData = null;
                let originalName = "";

                if (imported.settings && imported.characters) {
                    // Single series format
                    seriesData = imported;
                    originalName = imported.name || "Imported Series";
                } else if (imported.series && Object.keys(imported.series).length > 0) {
                    // It's a full backup, pick the first series or active one
                    const firstId = imported.activeSeriesId || Object.keys(imported.series)[0];
                    seriesData = imported.series[firstId];
                    originalName = seriesData.name;
                }

                if (!seriesData) throw new Error("Invalid series format");

                const newName = prompt("Rename series before import?", originalName);
                if (newName === null) return; // Cancelled

                const finalName = newName.trim() || originalName;
                const newId = crypto.randomUUID();

                this.state.data.series[newId] = {
                    name: finalName,
                    settings: JSON.parse(JSON.stringify(seriesData.settings)),
                    characters: seriesData.characters.map(c => ({
                        ...c,
                        id: crypto.randomUUID()
                    }))
                };

                this.state.save();
                this.refreshSeriesUI(); // Update UI to switch to new series (optional: we usually switch to the new one)
                this.state.switchSeries(newId);
                this.refreshSeriesUI();

                els.seriesModal.classList.add('hidden');
                alert(`Series "${finalName}" imported successfully!`);

            } catch (err) {
                alert("Invalid Series JSON: " + err.message);
            }
            e.target.value = ''; // Reset
        };
        reader.readAsText(file);
    },

    importData(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (!importedData.series) throw new Error("Missing series data");
                this.showImportReview(importedData);
            } catch (err) {
                alert("Invalid JSON file: " + err.message);
            }
            e.target.value = ''; // Reset
        };
        reader.readAsText(file);
    },

    showImportReview(importedData) {
        els.importReviewList.innerHTML = '';
        this.importStrategies = {};

        Object.keys(importedData.series).forEach(importUuid => {
            const impSeries = importedData.series[importUuid];
            const localSeriesId = Object.keys(this.state.data.series).find(id =>
                this.state.data.series[id].name.toLowerCase() === impSeries.name.toLowerCase()
            );

            const group = document.createElement('div');
            group.className = 'import-series-group';

            const isConflict = !!localSeriesId;
            group.innerHTML = `
                <div class="import-series-header">
                    <div class="import-series-title">📁 ${impSeries.name}</div>
                    <div class="import-series-status ${isConflict ? 'conflict' : ''}">
                        ${isConflict ? 'Merging into existing' : 'New Series'}
                    </div>
                </div>
                <div class="import-char-list"></div>
            `;

            const charListEl = group.querySelector('.import-char-list');
            impSeries.characters.forEach(impChar => {
                const charItem = document.createElement('div');
                charItem.className = 'import-char-item';

                let hasCharConflict = false;
                if (localSeriesId) {
                    hasCharConflict = this.state.data.series[localSeriesId].characters.some(c =>
                        c.name.toLowerCase() === impChar.name.toLowerCase()
                    );
                }

                const portraitUrl = this.getOptimizedUrl(impChar.image, { w: 100, h: 100, fit: 'cover' }) || this.getPlaceholder(impChar.name);

                charItem.innerHTML = `
                    <div class="import-char-info">
                        <img src="${portraitUrl}" onerror="this.src='${this.getPlaceholder(impChar.name)}'">
                        <span>${impChar.name}</span>
                    </div>
                    <div class="import-char-conflict-actions">
                        ${hasCharConflict ? `
                            <button class="strategy-btn active" data-strategy="keep" data-id="${importUuid}_${impChar.name}">Keep Local</button>
                            <button class="strategy-btn" data-strategy="overwrite" data-id="${importUuid}_${impChar.name}">Overwrite</button>
                            <button class="strategy-btn" data-strategy="dual" data-id="${importUuid}_${impChar.name}">Dual Copy</button>
                        ` : '<span class="import-char-status">New</span>'}
                    </div>
                `;

                if (hasCharConflict) {
                    this.importStrategies[`${importUuid}_${impChar.name}`] = 'keep';
                    charItem.querySelectorAll('.strategy-btn').forEach(btn => {
                        btn.onclick = () => {
                            charItem.querySelectorAll('.strategy-btn').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            this.importStrategies[`${importUuid}_${impChar.name}`] = btn.dataset.strategy;
                        };
                    });
                } else {
                    this.importStrategies[`${importUuid}_${impChar.name}`] = 'new';
                }

                charListEl.appendChild(charItem);
            });

            els.importReviewList.appendChild(group);
        });

        els.dataModal.classList.add('hidden');
        els.importReviewModal.classList.remove('hidden');

        els.cancelImportBtn.onclick = () => els.importReviewModal.classList.add('hidden');
        els.confirmImportBtn.onclick = () => this.executeImport(importedData);
    },

    executeImport(importedData) {
        const localData = this.state.data;

        Object.keys(importedData.series).forEach(importUuid => {
            const impSeries = importedData.series[importUuid];
            const localSeriesId = Object.keys(localData.series).find(id =>
                localData.series[id].name.toLowerCase() === impSeries.name.toLowerCase()
            );

            if (localSeriesId) {
                // Merge characters into existing series
                const targetSeries = localData.series[localSeriesId];
                impSeries.characters.forEach(impChar => {
                    const strategy = this.importStrategies[`${importUuid}_${impChar.name}`];

                    if (strategy === 'overwrite') {
                        const idx = targetSeries.characters.findIndex(c => c.name.toLowerCase() === impChar.name.toLowerCase());
                        if (idx !== -1) {
                            const oldId = targetSeries.characters[idx].id;
                            targetSeries.characters[idx] = { ...impChar, id: oldId };
                        }
                    } else if (strategy === 'dual') {
                        targetSeries.characters.push({ ...impChar, id: crypto.randomUUID(), name: `${impChar.name} (2)` });
                    } else if (strategy === 'new') {
                        targetSeries.characters.push({ ...impChar, id: crypto.randomUUID() });
                    }
                });
            } else {
                // Create new series
                const newId = crypto.randomUUID();
                localData.series[newId] = {
                    name: impSeries.name,
                    settings: JSON.parse(JSON.stringify(impSeries.settings)),
                    characters: impSeries.characters.map(c => ({ ...c, id: crypto.randomUUID() }))
                };
            }
        });

        this.state.save();
        els.importReviewModal.classList.add('hidden');
        this.refreshSeriesUI();
        alert("Import complete!");
    },

    async checkSyncConflict() {
        if (!window.gapi || !gapi.client || !gapi.client.getToken()) return;

        const remoteFile = await this.drive.findBackupFile();
        if (!remoteFile) {
            // First time sync for this user
            this.drive.saveToCloud(this.state.data).then(() => this.updateSyncUI());
            return;
        }

        const remoteData = await this.drive.downloadFile(remoteFile.id);
        if (!remoteData) return;

        const localUpdated = this.state.data.lastUpdated || 0;
        const remoteUpdated = remoteData.lastUpdated || 0;

        // Tolerance of 2 seconds for clock drift/latency
        const diff = remoteUpdated - localUpdated;

        if (diff > 2000) {
            // Remote is newer
            if (confirm(`Cloud data is newer than local data.\n\nCloud: ${new Date(remoteUpdated).toLocaleString()}\nLocal: ${new Date(localUpdated).toLocaleString()}\n\nOverwrite local with Cloud data?`)) {
                this.state.data = remoteData;
                localStorage.setItem(this.state.storageKey, JSON.stringify(this.state.data));
                localStorage.setItem('csg_is_dirty', 'false');
                window.location.reload();
            }
        } else if (localUpdated - remoteUpdated > 2000) {
            // Local is newer
            console.log('Local data is newer, uploading...');
            this.drive.saveToCloud(this.state.data).then(() => this.updateSyncUI());
        } else {
            console.log('Sync is up to date');
            localStorage.setItem('csg_is_dirty', 'false');
            this.updateSyncUI();
        }
    }
};

window.onload = () => App.init();
