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

    updateSeriesName(name) {
        this.activeSeries.name = name;
        this.save();
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
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
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
                if (tokenResponse.error !== undefined) throw tokenResponse;
                this.accessToken = tokenResponse.access_token;
                if (this.callbacks.onSignIn) this.callbacks.onSignIn();
            },
        });
        this.isInitialized = true;
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

    async findBackupFile() {
        try {
            const response = await gapi.client.drive.files.list({
                q: "name = 'csg_backup.json' and trashed = false",
                fields: 'files(id, name)',
                spaces: 'drive'
            });
            const files = response.result.files;
            return (files && files.length > 0) ? files[0].id : null;
        } catch (err) {
            console.error('Error finding file', err);
            return null;
        }
    }

    async saveToCloud(data) {
        const fileId = await this.findBackupFile();
        const fileContent = JSON.stringify(data);
        const file = new Blob([fileContent], { type: 'application/json' });
        const metadata = { 'name': 'csg_backup.json', 'mimeType': 'application/json' };
        const accessToken = gapi.client.getToken().access_token;
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        const url = fileId
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        await fetch(url, {
            method: fileId ? 'PATCH' : 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form
        });
        console.log('Saved to Drive');
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
    addBtn: document.getElementById('add-char-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    syncBtn: document.getElementById('sync-btn'),
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
    // Edit Current
    editCurrentBtn: document.getElementById('edit-current-btn'),
};

const App = {
    init() {
        this.state = new State();
        this.graph = new Graph(els.svg);
        this.miniGraph = new Graph(els.settingMiniGraph);

        // Initialize Drive Sync
        this.drive = new GoogleDriveSync({
            onSignIn: () => {
                alert('Synced with Google Drive!');
                // Auto-upload current state on connect
                this.drive.saveToCloud(this.state.data);
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

        els.cancelSettingsBtn.onclick = () => els.settingsModal.classList.add('hidden');
        els.saveSettingsBtn.onclick = () => {
            const tiers = els.settingTiers.value.split(',').map(s => s.trim()).filter(Boolean);
            const names = [];
            document.querySelectorAll('#settings-preview-container .stat-name-input-wrapper input').forEach(inp => {
                names.push(inp.value.trim() || inp.placeholder);
            });

            this.state.activeSeries.settings.tiers = tiers;
            this.state.activeSeries.settings.statNames = names;
            this.state.save();

            this.refreshGraph();
            els.settingsModal.classList.add('hidden');
        };

        els.syncBtn.onclick = () => this.drive.handleAuthClick();

        // Keyboard Navigation
        window.addEventListener('keydown', (e) => {
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
        const s = this.state.settings;
        els.settingTiers.value = s.tiers.join(',');
        document.getElementById('settings-preview-container').className = 'mode-add';
        document.getElementById('mode-add-btn').classList.add('active');
        document.getElementById('mode-remove-btn').classList.remove('active');

        this.renderSettingsPreview();
        els.settingsModal.classList.remove('hidden');
    },

    renderSettingsPreview() {
        const dim = this.state.settings.dimensions;
        const existingNames = this.state.settings.statNames || [];
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
                    this.state.removeStat(i);
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
                <circle cx="${100 + hx}" cy="${100 + hy}" r="15" fill="transparent" />
                <circle class="add-hitbox-marker" cx="${100 + hx}" cy="${100 + hy}" r="6" />
                <text x="${100 + hx}" y="${100 + hy + 4}" font-size="10" text-anchor="middle" fill="white" font-weight="bold">+</text>
            `;
            hitbox.onclick = () => {
                if (this.settingsEditMode === 'add') {
                    this.state.insertStat(i + 1);
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
            const btn = document.createElement('button');
            btn.className = `series-option ${s.id === this.state.data.activeSeriesId ? 'active' : ''}`;
            btn.innerText = s.name;
            btn.onclick = () => {
                this.state.switchSeries(s.id);
                this.refreshSeriesUI();
                els.seriesModal.classList.add('hidden');
            };
            els.seriesList.appendChild(btn);
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
            const imgUrl = char.image || this.getPlaceholder(char.name);

            div.innerHTML = `
                <div class="char-info-row" style="display:flex; align-items:center; gap:10px; flex:1">
                    <img src="${imgUrl}" class="char-thumb">
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
            els.activeImageContainer.innerHTML = char.image ? `<img src="${char.image}" class="portrait-img">` : '';
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
        } else {
            els.editName.value = 'New Character';
            els.editImage.value = '';
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
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=64`;
    }
};

window.onload = () => App.init();
