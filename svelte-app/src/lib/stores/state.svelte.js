// import { browser } from '$app/environment'; // Remove SvelteKit dependency

const STORAGE_KEY = 'csg_data_v2';
const isBrowser = typeof window !== 'undefined';

function createDefaultData() {
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

class AppState {
    data = $state(createDefaultData());
    isDirty = $state(false);
    lastSync = $state(null);

    constructor() {
        if (isBrowser) {
            const loaded = this.load();
            if (loaded) {
                this.data = loaded;
                // Migration check
                if (!this.data.series) {
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
            } else {
                this.data = createDefaultData();
                this.save();
            }

            this.lastSync = localStorage.getItem('csg_last_sync');
            this.isDirty = localStorage.getItem('csg_is_dirty') === 'true';
        }
    }

    load() {
        try {
            let json = localStorage.getItem('csg_data_v2');
            if (json) return JSON.parse(json);
            json = localStorage.getItem('csg_data_v1');
            if (json) return JSON.parse(json);
            return null;
        } catch (e) {
            console.error("Load failed", e);
            return null;
        }
    }

    save() {
        if (!isBrowser) return;
        this.data.lastUpdated = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));

        // Mark as dirty for sync
        this.isDirty = true;
        localStorage.setItem('csg_is_dirty', 'true');
    }

    markSynced() {
        this.isDirty = false;
        localStorage.setItem('csg_is_dirty', 'false');
        const now = new Date().toISOString();
        this.lastSync = now;
        localStorage.setItem('csg_last_sync', now);
    }

    // --- Series Helpers ---
    get activeSeries() {
        return this.data.series[this.data.activeSeriesId];
    }

    get seriesList() {
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
        if (Object.keys(this.data.series).length <= 1) return false;
        const newSeries = { ...this.data.series };
        delete newSeries[id];
        this.data.series = newSeries;

        if (this.data.activeSeriesId === id) {
            this.data.activeSeriesId = Object.keys(this.data.series)[0];
        }
        this.save();
        return true;
    }

    // --- Active Series Methods ---
    get settings() {
        return this.activeSeries.settings;
    }

    updateSettings(dimensions, tiers, statNames) {
        const oldDim = this.activeSeries.settings.dimensions;

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

    get characters() {
        return this.activeSeries.characters;
    }

    getCharacter(id) {
        return this.activeSeries.characters.find(c => c.id === id);
    }

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

export const appState = new AppState();
