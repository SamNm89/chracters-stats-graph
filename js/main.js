import { State } from './state.js';
import { Graph } from './graph.js';
import { GoogleDriveSync } from './drive.js';

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
    async init() {
        this.state = new State();
        await this.state.init(); // Async init

        this.graph = new Graph(els.svg);
        this.miniGraph = new Graph(els.settingMiniGraph);

        // Initialize Drive Sync
        this.drive = new GoogleDriveSync({
            onSignIn: () => {
                this.updateSyncUI();
                this.checkForCloudUpdates();
            },
            onSignedOut: () => {
                this.updateSyncUI();
            },
            onSyncStart: () => {
                els.syncStatusIndicator.className = 'sync-indicator syncing';
                els.syncStatusIndicator.title = 'Syncing...';
            },
            onSyncComplete: () => {
                this.updateSyncUI();
            }
        });

        // Wait for scripts to load if needed, but we can start init
        this.drive.init();

        // Subscribe to state changes to trigger auto-save
        this.state.subscribe(() => {
            this.handleStateChange();
        });

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
        els.createSeriesBtn.onclick = async () => {
            const name = els.newSeriesInput.value.trim();
            if (name) {
                await this.state.createSeries(name);
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
        els.saveSettingsBtn.onclick = async () => {
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
            await this.state.save();

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
            titleBtn.onclick = async () => {
                await this.state.switchSeries(s.id);
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
            editBtn.onclick = async (e) => {
                e.stopPropagation();
                const newName = prompt("Enter new name for the series:", s.name);
                if (newName && newName.trim() !== "") {
                    await this.state.updateSeriesName(s.id, newName.trim());
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
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                const confirmName = prompt(`To delete series "${s.name}", please type its name exactly:`);
                if (confirmName === s.name) {
                    const success = await this.state.deleteSeries(s.id);
                    if (success) {
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
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`Delete ${char.name}?`)) {
                    await this.state.deleteCharacter(char.id);
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

    async saveCharacter() {
        const stats = [];
        els.statSliders.querySelectorAll('input').forEach(i => stats.push(parseInt(i.value)));
        const data = {
            id: this.editingId,
            name: els.editName.value || 'Unnamed',
            image: els.editImage.value,
            bgImage: els.editBg.value,
            stats: stats
        };
        const savedId = await this.state.saveCharacter(data);
        this.selectCharacter(savedId);
        els.editorPanel.classList.add('hidden');
    },

    async deleteCharacter() {
        if (this.editingId && confirm("Delete?")) {
            await this.state.deleteCharacter(this.editingId);
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

    triggerAutoSync(force = false) {
        if (!this.drive.isSignedIn) return;

        if (force || this.isDataDirty()) {
            console.log('Syncing to cloud...');
            this.drive.saveToCloud(this.state.data).then(() => {
                this.updateSyncUI();
            });
        }
    },

    updateSyncUI() {
        const isConnected = this.drive.isSignedIn;
        const lastSync = localStorage.getItem('csg_last_sync');
        const isDirty = this.isDataDirty();
        const driveCard = document.querySelector('.drive-card');

        if (isConnected) {
            els.syncDetails.classList.remove('hidden');
            els.signOutBtn.classList.remove('hidden');
            els.syncBtn.innerText = 'Sync Now';
            els.syncBtn.classList.add('secondary-btn');
            els.syncBtn.classList.remove('primary-btn');
            els.syncBtn.onclick = () => this.triggerAutoSync(true); // Manual trigger force

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
            els.syncBtn.onclick = () => this.drive.handleAuthClick();
            els.syncStatusIndicator.className = 'sync-indicator';
            if (driveCard) driveCard.classList.remove('connected');
            if (els.syncUserEmail) els.syncUserEmail.innerText = 'Not available';
        }
    },

    async checkForCloudUpdates() {
        if (!this.drive.isSignedIn) return;

        console.log("Checking for cloud updates...");
        const remote = await this.drive.loadFromCloud();

        if (!remote) {
            console.log("No remote data found. Uploading local.");
            // No remote file, so we just upload our local state if we have any
            this.triggerAutoSync(true);
            return;
        }

        const remoteTime = dayjs(remote.metadata.modifiedTime);
        const lastSync = localStorage.getItem('csg_last_sync');
        const localTime = lastSync ? dayjs(lastSync) : dayjs(0); // If never synced, treat as old

        console.log(`Local: ${localTime.format()}, Remote: ${remoteTime.format()}`);

        // If remote is significantly newer (e.g. > 2 seconds to account for network drift)
        if (remoteTime.diff(localTime) > 2000) {
            if (this.isDataDirty()) {
                // Conflict: Both changed
                this.showSyncConflict(remote);
            } else {
                // Local is clean but old: Auto-update from cloud
                console.log("Remote is newer and local is clean. Updating from cloud.");
                this.applyCloudData(remote.data);
            }
        } else {
            console.log("Local is up to date or newer.");
            if (this.isDataDirty()) {
                this.triggerAutoSync();
            }
        }
    },

    showSyncConflict(remote) {
        const modal = document.getElementById('sync-conflict-modal');
        const cloudTimeEl = document.getElementById('conflict-cloud-time');
        const localTimeEl = document.getElementById('conflict-local-time');
        const useCloudBtn = document.getElementById('use-cloud-btn');
        const useLocalBtn = document.getElementById('use-local-btn');

        cloudTimeEl.innerText = `Last Modified: ${new Date(remote.metadata.modifiedTime).toLocaleString()}`;
        localTimeEl.innerText = `Last Modified: ${new Date().toLocaleString()} (Unsaved changes)`;

        useCloudBtn.onclick = () => {
            this.applyCloudData(remote.data);
            modal.classList.add('hidden');
        };

        useLocalBtn.onclick = () => {
            // Force push local to cloud
            this.triggerAutoSync(true);
            modal.classList.add('hidden');
        };

        modal.classList.remove('hidden');
    },

    async applyCloudData(data) {
        this.state.data = data;
        await this.state.save();
        localStorage.setItem('csg_last_sync', new Date().toISOString());
        localStorage.setItem('csg_is_dirty', 'false');

        // Refresh UI
        this.refreshSeriesUI();
        this.updateSyncUI();
        console.log("Cloud data applied.");
    },

    handleStateChange() {
        localStorage.setItem('csg_is_dirty', 'true');
        this.debouncedSave();
    },

    // Debounced save
    debouncedSave: _.debounce(function() {
        this.triggerAutoSync();
    }, 5000), // 5 seconds debounce

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
        reader.onload = async (event) => {
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

                await this.state.save();
                this.refreshSeriesUI(); // Update UI to switch to new series (optional: we usually switch to the new one)
                await this.state.switchSeries(newId);
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

    async executeImport(importedData) {
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

        await this.state.save();
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
