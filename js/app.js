/**
 * Unified App Script for Local file:// Compatibility
 * Contains: State, Graph, GoogleDriveSync, and UI Logic
 */

/* =========================================
   1. STATE MANAGEMENT
   ========================================= */
class State {
    constructor() {
        this.storageKey = 'csg_data_v1';
        this.data = this.load() || this.createDefault();
        this.activeCharId = null;
    }

    createDefault() {
        return {
            settings: {
                dimensions: 3, // Default to Triangle as requested
                tiers: ['F', 'B', 'A', 'S'] // 4 Layers: F (Low), B, A, S (High/Max)
            },
            characters: []
        };
    }

    load() {
        try {
            const json = localStorage.getItem(this.storageKey);
            return json ? JSON.parse(json) : null;
        } catch (e) {
            console.error("Load failed", e);
            return null;
        }
    }

    save() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    }

    get settings() { return this.data.settings; }

    updateSettings(dimensions, tiers) {
        this.data.settings.dimensions = dimensions;
        this.data.settings.tiers = tiers;
        this.save();
    }

    getCharacters() { return this.data.characters; }

    getCharacter(id) { return this.data.characters.find(c => c.id === id); }

    saveCharacter(charData) {
        if (!charData.id) {
            charData.id = crypto.randomUUID();
            this.data.characters.push(charData);
        } else {
            const idx = this.data.characters.findIndex(c => c.id === charData.id);
            if (idx !== -1) this.data.characters[idx] = charData;
        }
        this.save();
        return charData.id;
    }

    deleteCharacter(id) {
        this.data.characters = this.data.characters.filter(c => c.id !== id);
        this.save();
    }
}

/* =========================================
   2. GRAPH ENGINE (SVG)
   ========================================= */
class Graph {
    constructor(svgElement) {
        this.svg = svgElement;
        // SVG dimensions - keeping it responsive but using a fixed coordinate system internally
        this.width = 500;
        this.height = 500;
        this.center = { x: 250, y: 250 };
        this.radius = 180; // slightly smaller to fit labels
        this.settings = null;
        this.currentStats = [];

        // Ensure SVG has viewbox
        this.svg.setAttribute('viewBox', `0 0 500 500`);
    }

    init(settings) {
        this.settings = settings;
        // Default stats if empty
        if (!this.currentStats.length || this.currentStats.length !== settings.dimensions) {
            this.currentStats = new Array(settings.dimensions).fill(0);
        }
        this.drawGrid();
        this.drawShape(this.currentStats);
    }

    drawGrid() {
        this.svg.innerHTML = ''; // Clear
        const N = this.settings.dimensions;
        const tiers = this.settings.tiers;
        const tierCount = tiers.length - 1; // 0 index (F) is center? No, usually F is 1 step, or 0? 
        // Let's assume F is smallest, S is max. 
        // If tiers=['F','B','A','S'], that is 4 levels.
        // Let's map indexes: 0..3. 
        // We need 4 concentric rings? Or 3?
        // Usually index 0 (F) is the inner-most ring, index 3 (S) is the outer edge.

        // Draw concentric polygons
        for (let i = tierCount; i >= 0; i--) {
            // Fraction: (i+1) / total_levels? 
            // If i=3 (S), radius = 100%. i=0 (F), radius = 25%.
            const fraction = (i + 1) / tiers.length;
            const points = this.getPolygonPoints(N, this.radius * fraction);

            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', mapPoints(points));
            poly.setAttribute('class', i === tierCount ? 'graph-web outer' : 'graph-web inner');
            this.svg.appendChild(poly);

            // Add Text Label for Tier (e.g. "S") on the top axis
            // Only strictly if we want labels on the web itself
        }

        // Draw Axes
        const outerPoints = this.getPolygonPoints(N, this.radius);
        outerPoints.forEach((p, idx) => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', this.center.x);
            line.setAttribute('y1', this.center.y);
            line.setAttribute('x2', p.x);
            line.setAttribute('y2', p.y);
            line.setAttribute('class', 'graph-axis');
            this.svg.appendChild(line);
        });
    }

    getPolygonPoints(sides, r) {
        const points = [];
        const angleStep = (Math.PI * 2) / sides;
        const startAngle = -Math.PI / 2; // Up
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
        let shape = this.svg.querySelector('.graph-shape');
        if (!shape) {
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            shape.setAttribute('class', 'graph-shape');
            this.svg.appendChild(shape);
        }
        const pointsString = this.calculateShapeString(stats);
        shape.setAttribute('points', pointsString);

        // Add "dots" at vertices?
        // Clean up old dots
        this.svg.querySelectorAll('.graph-dot').forEach(el => el.remove());

        const coords = this.getStatCoords(stats);
        coords.forEach(p => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', p.x);
            circle.setAttribute('cy', p.y);
            circle.setAttribute('r', 4);
            circle.setAttribute('class', 'graph-dot');
            this.svg.appendChild(circle);
        });
    }

    getStatCoords(stats) {
        const N = this.settings.dimensions;
        const tiers = this.settings.tiers;
        const maxIndex = tiers.length; // Denominator. 
        // If value S (index 3), we want 100% radius?
        // Let's treat value as 1-based for radius calc: (value+1) / length.
        // F=0 -> 1/4 radius? Or 0?
        // User asked "Naming them S A B F". Let's assume F is lowest.

        const angleStep = (Math.PI * 2) / N;
        const startAngle = -Math.PI / 2;

        return stats.map((val, i) => {
            // val is index in tiers array (0..3)
            // Normalized: (val + 1) / 4
            const fraction = (val + 1) / tiers.length;
            const r = this.radius * Math.max(0.1, fraction); // Min 0.1 so it doesn't vanish

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
        // Simple JS interpolation
        const startStats = [...this.currentStats];

        // Pad arrays if dimension changed
        while (startStats.length < targetStats.length) startStats.push(0);

        const startTime = performance.now();
        const duration = 400;

        const loop = (t) => {
            const elapsed = t - startTime;
            const p = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - p, 3); // Cubic Out

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

function mapPoints(arr) {
    return arr.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

/* =========================================
   3. GOOGLE SYNC (Simplified)
   ========================================= */
// Note: To work, user must fill CLIENT_ID.
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

class GoogleDriveSync {
    constructor(callbacks) {
        this.tokenClient = null;
        this.accessToken = null;
        this.callbacks = callbacks || {};
    }

    async init() {
        if (!CLIENT_ID || CLIENT_ID.includes('YOUR_CLIENT_ID')) {
            console.log("Sync: Client ID not configured.");
            return;
        }
        await this.loadScripts();
        await new Promise(r => gapi.load('client', r));
        await gapi.client.init({
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        });
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (resp) => {
                if (resp.error) throw resp;
                this.accessToken = resp.access_token;
                if (this.callbacks.onSignIn) this.callbacks.onSignIn();
            }
        });
    }

    loadScripts() {
        return new Promise((resolve) => {
            if (window.google && window.gapi) return resolve();
            const s1 = document.createElement('script');
            s1.src = "https://accounts.google.com/gsi/client";
            s1.onload = () => {
                const s2 = document.createElement('script');
                s2.src = "https://apis.google.com/js/api.js";
                s2.onload = resolve;
                document.body.appendChild(s2);
            };
            document.body.appendChild(s1);
        });
    }

    handleAuthClick() {
        if (!this.tokenClient) {
            alert("Google Sync not configured. Edit js/app.js with your Client ID.");
            return;
        }
        this.tokenClient.requestAccessToken({ prompt: '' });
    }

    async saveToCloud(data) {
        if (!this.accessToken) return;
        // Search for file
        try {
            const list = await gapi.client.drive.files.list({
                q: "name = 'csg_backup.json' and trashed = false",
                fields: 'files(id, name)'
            });
            const file = list.result.files[0];
            const fileId = file ? file.id : null;

            const meta = { name: 'csg_backup.json', mimeType: 'application/json' };
            const body = JSON.stringify(data);

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
            form.append('file', new Blob([body], { type: 'application/json' }));

            const method = fileId ? 'PATCH' : 'POST';
            const url = fileId
                ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
                : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

            await fetch(url, {
                method: method,
                headers: { 'Authorization': 'Bearer ' + this.accessToken },
                body: form
            });
            console.log("Synced to Cloud");
        } catch (e) {
            console.error("Sync failed", e);
        }
    }

    // basic sync implementation (download) omitted for brevity in this unified file 
    // but structure is here for extension.
}

/* =========================================
   4. MAIN APP CONTROLLER
   ========================================= */
const els = {
    // Lists
    charList: document.getElementById('character-list'),

    // Graph
    svg: document.getElementById('stat-graph'),
    activeName: document.getElementById('active-name'),
    activeImageContainer: document.getElementById('active-image-container'),

    // Editor
    editorPanel: document.getElementById('editor-panel'),
    editName: document.getElementById('edit-name'),
    editImage: document.getElementById('edit-image'),
    statSliders: document.getElementById('stat-sliders'),
    saveBtn: document.getElementById('save-char-btn'),
    deleteBtn: document.getElementById('delete-char-btn'),
    closeEditor: document.getElementById('close-editor'),

    // Actions
    addBtn: document.getElementById('add-char-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    syncBtn: document.getElementById('sync-btn'),

    // Modal
    settingsModal: document.getElementById('settings-modal'),
    settingVertices: document.getElementById('setting-vertices'),
    settingTiers: document.getElementById('setting-tiers'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    cancelSettingsBtn: document.getElementById('cancel-settings-btn'),
};

const App = {
    init() {
        this.state = new State();
        this.graph = new Graph(els.svg);
        this.editingId = null;

        this.drive = new GoogleDriveSync({
            onSignIn: () => {
                this.drive.saveToCloud(this.state.data);
                alert("Connected to Drive!");
            }
        });
        this.drive.init().catch(e => console.log("Drive init skipped/failed"));

        this.bindEvents();
        this.renderList();

        // Initial render
        this.graph.init(this.state.settings);

        // Select first character if exists
        const chars = this.state.getCharacters();
        if (chars.length > 0) this.selectCharacter(chars[0].id);
        else this.renderEmptyState();
    },

    bindEvents() {
        els.addBtn.onclick = () => this.openEditor(null);
        els.closeEditor.onclick = () => els.editorPanel.classList.add('hidden');
        els.saveBtn.onclick = () => this.saveCharacter();
        els.deleteBtn.onclick = () => this.deleteCharacter();

        els.settingsBtn.onclick = () => {
            // Populate current values
            els.settingVertices.value = this.state.settings.dimensions;
            els.settingTiers.value = this.state.settings.tiers.join(',');
            els.settingsModal.classList.remove('hidden');
        };

        els.cancelSettingsBtn.onclick = () => els.settingsModal.classList.add('hidden');

        els.saveSettingsBtn.onclick = () => {
            const dim = parseInt(els.settingVertices.value);
            const tiers = els.settingTiers.value.split(',').map(s => s.trim()).filter(s => s);
            this.state.updateSettings(dim, tiers);
            this.graph.init(this.state.settings);
            // Refresh active char to match new dims
            if (this.state.activeCharId) this.selectCharacter(this.state.activeCharId);
            els.settingsModal.classList.add('hidden');
        };

        els.syncBtn.onclick = () => this.drive.handleAuthClick();
    },

    renderList() {
        els.charList.innerHTML = '';
        const chars = this.state.getCharacters();

        if (chars.length === 0) {
            els.charList.innerHTML = `<div class="empty-roster">No Characters</div>`;
            return;
        }

        chars.forEach(char => {
            const div = document.createElement('div');
            div.className = `char-item ${this.state.activeCharId === char.id ? 'active' : ''}`;

            // Placeholder/Image
            const imgUrl = char.image || this.getPlaceholderSvg(char.name);

            div.innerHTML = `
                <img src="${imgUrl}" class="char-thumb" onerror="this.style.display='none'">
                <span>${char.name}</span>
            `;

            div.onclick = () => this.selectCharacter(char.id);
            els.charList.appendChild(div);
        });
    },

    renderEmptyState() {
        els.activeName.innerText = "Select a Character";
        els.activeImageContainer.innerHTML = '';
        // Zero graph
        this.graph.animateTo(new Array(this.state.settings.dimensions).fill(0));
    },

    selectCharacter(id) {
        this.state.activeCharId = id;
        this.renderList();

        const char = this.state.getCharacter(id);
        if (char) {
            els.activeName.innerText = char.name;
            // Image
            if (char.image) {
                els.activeImageContainer.innerHTML = `<img src="${char.image}" class="portrait-img">`;
            } else {
                els.activeImageContainer.innerHTML = '';
            }
            this.graph.animateTo(char.stats);
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
            els.editName.value = 'New Hero';
            els.editImage.value = '';
        }
    },

    renderEditorInputs(id) {
        els.statSliders.innerHTML = '';
        const count = this.state.settings.dimensions;
        const tiers = this.state.settings.tiers;
        const char = id ? this.state.getCharacter(id) : null;
        const stats = char ? char.stats : new Array(count).fill(Math.floor(tiers.length / 2));

        for (let i = 0; i < count; i++) {
            const wrapper = document.createElement('div');
            wrapper.className = 'stat-control';

            // Default stat names can be overridden logically later if needed
            // For now: Stat 1, Stat 2... or specific names if user wanted to map them
            const labelText = `Stat ${i + 1}`;

            const maxVal = tiers.length - 1;
            const currentVal = stats[i] !== undefined ? stats[i] : 0;
            const currentTier = tiers[currentVal] || tiers[0];

            wrapper.innerHTML = `
                <label>
                    ${labelText}
                    <span id="lbl-${i}" class="tier-badge">${currentTier}</span>
                </label>
                <input type="range" data-index="${i}" min="0" max="${maxVal}" value="${currentVal}">
            `;
            els.statSliders.appendChild(wrapper);
        }

        // Live preview
        els.statSliders.querySelectorAll('input').forEach(input => {
            input.oninput = (e) => {
                const idx = e.target.dataset.index;
                const val = parseInt(e.target.value);
                const span = document.getElementById(`lbl-${idx}`);
                span.innerText = tiers[val];

                // Preview on graph
                this.previewGraphFromEditor();
            };
        });
    },

    previewGraphFromEditor() {
        const stats = [];
        els.statSliders.querySelectorAll('input').forEach(input => stats.push(parseInt(input.value)));
        this.graph.animateTo(stats);
    },

    saveCharacter() {
        const stats = [];
        els.statSliders.querySelectorAll('input').forEach(input => stats.push(parseInt(input.value)));

        const data = {
            id: this.editingId,
            name: els.editName.value || 'Unnamed',
            image: els.editImage.value,
            stats: stats
        };

        const newId = this.state.saveCharacter(data);
        this.selectCharacter(newId);
        // Auto-close editor or keep it matching "Premium" feel? 
        // Let's keep open if user is editing, but maybe flash success.
        // For now, simple save.
    },

    deleteCharacter() {
        if (!this.editingId) return;
        if (confirm("Delete this character?")) {
            this.state.deleteCharacter(this.editingId);
            this.editingId = null;
            els.editorPanel.classList.add('hidden');
            this.state.activeCharId = null;
            this.renderList();
            this.renderEmptyState();
        }
    },

    getPlaceholderSvg(name) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=64`;
    }
};

// Boot
window.onload = () => App.init();
