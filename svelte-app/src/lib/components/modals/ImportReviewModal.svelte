<script>
    import { appState } from '$lib/stores/state.svelte.js';

    let { isOpen, importedData, onClose } = $props();

    let conflicts = $state([]);
    let strategies = $state({}); // key: uniqueId, value: 'keep', 'overwrite', 'dual', 'new'

    function getOptimizedUrl(url) {
        if (!url || typeof url !== 'string') return null;
        if (!url.startsWith('http')) return url;
        const cleanUrl = url.replace(/^https?:\/\//, '');
        const params = new URLSearchParams({
            url: cleanUrl,
            noproxy: '1',
            default: url,
            w: 100, h: 100, fit: 'cover'
        });
        return `https://images.weserv.nl/?${params.toString()}`;
    }

    function getPlaceholder(name) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
    }

    $effect(() => {
        if (isOpen && importedData && importedData.series) {
            analyzeConflicts();
        }
    });

    function analyzeConflicts() {
        const list = [];
        const strat = {};

        Object.keys(importedData.series).forEach(importUuid => {
            const impSeries = importedData.series[importUuid];
            const localSeriesId = Object.keys(appState.data.series).find(id =>
                appState.data.series[id].name.toLowerCase() === impSeries.name.toLowerCase()
            );

            const seriesInfo = {
                name: impSeries.name,
                isConflict: !!localSeriesId,
                characters: []
            };

            impSeries.characters.forEach(impChar => {
                let hasCharConflict = false;
                if (localSeriesId) {
                    hasCharConflict = appState.data.series[localSeriesId].characters.some(c =>
                        c.name.toLowerCase() === impChar.name.toLowerCase()
                    );
                }

                const charKey = `${importUuid}_${impChar.name}`;

                if (hasCharConflict) {
                    strat[charKey] = 'keep'; // default
                } else {
                    strat[charKey] = 'new';
                }

                seriesInfo.characters.push({
                    ...impChar,
                    hasConflict: hasCharConflict,
                    key: charKey
                });
            });
            list.push(seriesInfo);
        });

        conflicts = list;
        strategies = strat;
    }

    function confirmImport() {
        const localData = appState.data;

        Object.keys(importedData.series).forEach(importUuid => {
            const impSeries = importedData.series[importUuid];
            const localSeriesId = Object.keys(localData.series).find(id =>
                localData.series[id].name.toLowerCase() === impSeries.name.toLowerCase()
            );

            if (localSeriesId) {
                const targetSeries = localData.series[localSeriesId];
                impSeries.characters.forEach(impChar => {
                    const key = `${importUuid}_${impChar.name}`;
                    const strategy = strategies[key];

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
                 const newId = crypto.randomUUID();
                 localData.series[newId] = {
                    name: impSeries.name,
                    settings: JSON.parse(JSON.stringify(impSeries.settings)),
                    characters: impSeries.characters.map(c => ({ ...c, id: crypto.randomUUID() }))
                 };
            }
        });

        appState.save();
        onClose();
        alert("Import complete!");
    }

</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div id="import-review-modal" class="modal" onclick={(e) => { if(e.target === e.currentTarget) onClose(); }}>
        <div class="modal-content glass-panel">
            <h2>Import Review</h2>
            <p class="modal-subtitle">We found some conflicts. Choose how to merge them.</p>

            <div id="import-review-list" class="import-review-list">
                {#each conflicts as series}
                <div class="import-series-group">
                    <div class="import-series-header">
                        <div class="import-series-title">📁 {series.name}</div>
                        <div class="import-series-status {series.isConflict ? 'conflict' : ''}">
                            {series.isConflict ? 'Merging into existing' : 'New Series'}
                        </div>
                    </div>
                    <div class="import-char-list">
                        {#each series.characters as char}
                            <div class="import-char-item">
                                <div class="import-char-info">
                                    <img src={getOptimizedUrl(char.image) || getPlaceholder(char.name)} alt={char.name} onerror={(e) => e.target.src = getPlaceholder(char.name)}>
                                    <span>{char.name}</span>
                                </div>
                                <div class="import-char-conflict-actions">
                                    {#if char.hasConflict}
                                        <button class="strategy-btn {strategies[char.key] === 'keep' ? 'active' : ''}" onclick={() => strategies[char.key] = 'keep'}>Keep Local</button>
                                        <button class="strategy-btn {strategies[char.key] === 'overwrite' ? 'active' : ''}" onclick={() => strategies[char.key] = 'overwrite'}>Overwrite</button>
                                        <button class="strategy-btn {strategies[char.key] === 'dual' ? 'active' : ''}" onclick={() => strategies[char.key] = 'dual'}>Dual Copy</button>
                                    {:else}
                                        <span class="import-char-status">New</span>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
                {/each}
            </div>

            <div class="merge-hint">
                <p>Conflicts are identified by name. Characters in "Keep Local" will stay as they are. "Overwrite"
                    replaces them with imported data.</p>
            </div>

            <div class="modal-actions">
                <button id="confirm-import-btn" class="primary-btn" onclick={confirmImport}>Complete Import</button>
                <button id="cancel-import-btn" class="secondary-btn" onclick={onClose}>Cancel</button>
            </div>
        </div>
    </div>
{/if}
