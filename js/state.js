export class State {
    constructor() {
        this.storageKey = 'csg_data_v2'; // Bump version
        this.data = null; // Data is loaded asynchronously
        this.callbacks = []; // Listeners for data changes
    }

    async init() {
        this.data = (await this.load()) || this.createDefault();

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
            await this.save();
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

    async load() {
        try {
            // Check localForage first
            let data = await localforage.getItem(this.storageKey);
            if (data) return data;

            // Fallback: Check localStorage (migration path)
            let json = localStorage.getItem('csg_data_v2');
            if (json) {
                data = JSON.parse(json);
                // Move to localForage
                await localforage.setItem(this.storageKey, data);
                return data;
            }

            // Check v1 key in localStorage
            json = localStorage.getItem('csg_data_v1');
            if (json) {
                // Return simple object, init will migrate it
                return JSON.parse(json);
            }
            return null;
        } catch (e) {
            console.error("Load failed", e);
            return null;
        }
    }

    async save() {
        if (!this.data) return;
        await localforage.setItem(this.storageKey, this.data);
        this.notifyListeners();
    }

    subscribe(callback) {
        this.callbacks.push(callback);
    }

    notifyListeners() {
        this.callbacks.forEach(cb => cb(this.data));
    }

    // --- Series Helpers ---

    get activeSeries() {
        if (!this.data) return null;
        return this.data.series[this.data.activeSeriesId];
    }

    getSeriesList() {
        if (!this.data) return [];
        return Object.keys(this.data.series).map(id => ({
            id,
            name: this.data.series[id].name
        }));
    }

    async createSeries(name) {
        const id = crypto.randomUUID();
        this.data.series[id] = {
            name: name,
            settings: { dimensions: 3, tiers: ['F', 'B', 'A', 'S'] },
            characters: []
        };
        this.data.activeSeriesId = id;
        await this.save();
        return id;
    }

    async switchSeries(id) {
        if (this.data.series[id]) {
            this.data.activeSeriesId = id;
            await this.save();
        }
    }

    async updateSeriesName(id, name) {
        if (this.data.series[id]) {
            this.data.series[id].name = name;
            await this.save();
        }
    }

    async deleteSeries(id) {
        // Can't delete the last one
        if (Object.keys(this.data.series).length <= 1) return false;

        delete this.data.series[id];
        // If we deleted active, switch to another
        if (this.data.activeSeriesId === id) {
            this.data.activeSeriesId = Object.keys(this.data.series)[0];
        }
        await this.save();
        return true;
    }

    // --- Active Series Methods ---

    get settings() { return this.activeSeries ? this.activeSeries.settings : null; }

    async updateSettings(dimensions, tiers, statNames) {
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
        await this.save();
    }

    async insertStat(index, name = "New Stat") {
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
        await this.save();
    }

    async removeStat(index) {
        const s = this.activeSeries;
        if (s.settings.dimensions <= 3) return;

        s.settings.dimensions--;
        if (s.settings.statNames) {
            s.settings.statNames.splice(index, 1);
        }

        s.characters.forEach(char => {
            if (char.stats) char.stats.splice(index, 1);
        });
        await this.save();
    }

    getCharacters() { return this.activeSeries ? this.activeSeries.characters : []; }

    getCharacter(id) { return this.activeSeries ? this.activeSeries.characters.find(c => c.id === id) : null; }

    async saveCharacter(charData) {
        if (!charData.id) {
            charData.id = crypto.randomUUID();
            this.activeSeries.characters.push(charData);
        } else {
            const idx = this.activeSeries.characters.findIndex(c => c.id === charData.id);
            if (idx !== -1) this.activeSeries.characters[idx] = charData;
        }
        await this.save();
        return charData.id;
    }

    async deleteCharacter(id) {
        this.activeSeries.characters = this.activeSeries.characters.filter(c => c.id !== id);
        await this.save();
    }
}
