<script>
    import { appState } from '$lib/stores/state.svelte.js';
    import Graph from '../Graph.svelte';

    let { isOpen, onClose } = $props();

    let settings = $state(null);
    let editMode = $state('add'); // 'add' or 'remove'
    let statNames = $state([]);

    // Draft state
    // We clone the settings when modal opens to allow cancelling
    $effect(() => {
        if (isOpen) {
            settings = JSON.parse(JSON.stringify(appState.settings));
            statNames = settings.statNames || new Array(settings.dimensions).fill("").map((_, i) => `Stat ${i + 1}`);
            // Ensure statNames length matches dimensions
            while (statNames.length < settings.dimensions) {
                statNames.push(`Stat ${statNames.length + 1}`);
            }
        }
    });

    function addStat(index) {
        if (editMode !== 'add') return;
        settings.dimensions++;
        statNames.splice(index, 0, "New Stat");
        settings.statNames = statNames;
    }

    function removeStat(index) {
        if (editMode !== 'remove') return;
        if (settings.dimensions <= 3) return;
        settings.dimensions--;
        statNames.splice(index, 1);
        settings.statNames = statNames;
    }

    function save() {
        appState.updateSettings(settings.dimensions, settings.tiers, statNames);
        onClose();
    }

    // Calculate input positions for overlay
    function getInputStyle(i, total) {
        const radius = 130;
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / total;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        return `left: calc(50% + ${x}px); top: calc(50% + ${y}px);`;
    }

</script>

{#if isOpen && settings}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div id="settings-modal" class="modal" onclick={(e) => { if(e.target === e.currentTarget) onClose(); }}>
        <div class="modal-content glass-panel">
            <h2>Global Settings</h2>
            <div id="settings-preview-container" class={editMode === 'add' ? 'mode-add' : 'mode-remove'}>
                <!-- Mini Graph -->
                <Graph width={200} height={200} mini={true} {settings} addHitboxMode={editMode === 'add'} onAddStat={addStat} />

                <!-- Stat Name Inputs Overlay -->
                {#each statNames as name, i}
                     <div class="stat-name-input-wrapper" style={getInputStyle(i, settings.dimensions)}>
                        <input type="text" bind:value={statNames[i]} placeholder={`Stat ${i + 1}`} onclick={(e) => { if(editMode === 'remove') { e.stopPropagation(); removeStat(i); } }}>
                     </div>
                {/each}

                <!-- Mode Toggles -->
                <div class="preview-mode-toggles">
                    <button id="mode-add-btn" class="mode-btn {editMode === 'add' ? 'active' : ''}" onclick={() => editMode = 'add'} title="Add Stat Mode">+</button>
                    <button id="mode-remove-btn" class="mode-btn {editMode === 'remove' ? 'active' : ''}" onclick={() => editMode = 'remove'} title="Remove Stat Mode">−</button>
                </div>
            </div>

            <label>
                Tiers (comma separated, low to high)
                <input id="setting-tiers" type="text" value={settings.tiers.join(',')} oninput={(e) => settings.tiers = e.target.value.split(',').map(s => s.trim()).filter(Boolean)}>
            </label>
            <div class="modal-actions">
                <button id="save-settings-btn" class="primary-btn" onclick={save}>Apply</button>
                <button id="cancel-settings-btn" class="secondary-btn" onclick={onClose}>Cancel</button>
            </div>
        </div>
    </div>
{/if}
