
export class State {
    constructor() {
        this.storageKey = 'csg_data_v1';
        this.data = this.load() || this.createDefault();
        this.activeCharId = null;
    }

    createDefault() {
        return {
            settings: {
                dimensions: 5, // Pentagon
                tiers: ['E', 'D', 'C', 'B', 'A', 'S'] // 0=E, 5=S
            },
            characters: [] // { id, name, image, stats: [] }
        };
    }

    load() {
        const json = localStorage.getItem(this.storageKey);
        return json ? JSON.parse(json) : null;
    }

    save() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    }

    get settings() {
        return this.data.settings;
    }

    updateSettings(dimensions, tiers) {
        this.data.settings.dimensions = dimensions;
        this.data.settings.tiers = tiers;
        this.save();
    }

    getCharacters() {
        return this.data.characters;
    }

    getCharacter(id) {
        return this.data.characters.find(c => c.id === id);
    }

    saveCharacter(charData) {
        if (!charData.id) {
            // New
            charData.id = crypto.randomUUID();
            this.data.characters.push(charData);
        } else {
            // Update
            const idx = this.data.characters.findIndex(c => c.id === charData.id);
            if (idx !== -1) {
                this.data.characters[idx] = charData;
            }
        }
        this.save();
        return charData.id;
    }

    deleteCharacter(id) {
        this.data.characters = this.data.characters.filter(c => c.id !== id);
        this.save();
    }
}
