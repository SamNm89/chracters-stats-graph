<script>
    import { appState } from '$lib/stores/state.svelte.js';

    let { charId, onClose } = $props();

    let char = $state(null);
    let name = $state('');
    let image = $state('');
    let bgImage = $state('');
    let stats = $state([]);

    let dimensions = $derived(appState.settings.dimensions);
    let tiers = $derived(appState.settings.tiers);
    let statNames = $derived(appState.settings.statNames || []);

    $effect(() => {
        if (charId) {
            char = appState.getCharacter(charId);
            if (char) {
                name = char.name;
                image = char.image || '';
                bgImage = char.bgImage || '';
                stats = [...char.stats];
            }
        } else {
            char = null;
            name = 'New Character';
            image = '';
            bgImage = '';
            stats = new Array(dimensions).fill(Math.floor(tiers.length / 2));
        }
        // Ensure stats length matches dimensions
        while (stats.length < dimensions) stats.push(0);
        if (stats.length > dimensions) stats = stats.slice(0, dimensions);
    });

    function save() {
        const data = {
            id: charId,
            name: name || 'Unnamed',
            image: image,
            bgImage: bgImage,
            stats: stats
        };
        const savedId = appState.saveCharacter(data);
        onClose(savedId);
    }

    function remove() {
        if (charId && confirm("Delete?")) {
            appState.deleteCharacter(charId);
            onClose(null);
        }
    }
</script>

<div id="editor-panel" class="editor-panel glass-panel">
    <div class="editor-header">
        <h3>Edit Stats</h3>
        <button id="close-editor" class="icon-btn close-btn" title="Close" onclick={() => onClose(charId)}>×</button>
    </div>
    <div class="editor-form">
        <label>
            Name
            <input id="edit-name" type="text" bind:value={name} placeholder="Character Name">
        </label>
        <label>
            Image URL (Portrait)
            <input id="edit-image" type="text" bind:value={image} placeholder="https://...">
        </label>
        <label>
            Background Image URL
            <input id="edit-bg" type="text" bind:value={bgImage} placeholder="https://...">
        </label>
        <div id="stat-sliders" class="stat-sliders">
            {#each stats as val, i}
                <div class="stat-control">
                    <label for={`stat-slider-${i}`}>
                        {statNames[i] || `Stat ${i + 1}`}
                        <span class="tier-badge">{tiers[val] || ''}</span>
                    </label>
                    <input id={`stat-slider-${i}`} type="range" min="0" max={tiers.length - 1} bind:value={stats[i]}>
                </div>
            {/each}
        </div>
        <button id="save-char-btn" class="primary-btn" onclick={save}>Save Character</button>
        {#if charId}
            <button id="delete-char-btn" class="danger-btn" onclick={remove}>Delete</button>
        {/if}
    </div>
</div>
