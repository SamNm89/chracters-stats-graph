<script>
    import { appState } from '$lib/stores/state.svelte.js';

    let { isOpen, onClose, onImport } = $props();

    let seriesList = $derived(appState.seriesList);
    let activeSeriesId = $derived(appState.data.activeSeriesId);
    let newSeriesName = $state('');
    let fileInput;

    function createSeries() {
        if (newSeriesName.trim()) {
            appState.createSeries(newSeriesName.trim());
            newSeriesName = '';
            onClose();
        }
    }

    function switchSeries(id) {
        appState.switchSeries(id);
        onClose();
    }

    function renameSeries(s) {
        const newName = prompt("Enter new name for the series:", s.name);
        if (newName && newName.trim() !== "") {
            appState.updateSeriesName(s.id, newName.trim());
        }
    }

    function deleteSeries(s) {
        const confirmName = prompt(`To delete series "${s.name}", please type its name exactly:`);
        if (confirmName === s.name) {
            if (!appState.deleteSeries(s.id)) {
                alert("Cannot delete the last series!");
            }
        } else if (confirmName !== null) {
            alert("Name didn't match. Deletion cancelled.");
        }
    }

    function exportSeries(s) {
         const series = appState.data.series[s.id];
        if (!series) return;

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
    }

</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div id="series-modal" class="modal" onclick={(e) => { if(e.target === e.currentTarget) onClose(); }}>
        <div class="modal-content glass-panel">
            <h2>Select Series</h2>
            <div id="series-list" class="series-list">
                {#each seriesList as s}
                    <div class="series-item {s.id === activeSeriesId ? 'active' : ''}">
                        <button class="series-item-name" onclick={() => switchSeries(s.id)}>{s.name}</button>
                        <div class="series-actions">
                             <button class="icon-btn xs-btn" title="Rename Series" onclick={() => renameSeries(s)}>✎</button>
                             <button class="icon-btn xs-btn" title="Export Series" onclick={() => exportSeries(s)}>📤</button>
                             <button class="icon-btn xs-btn del-btn" title="Delete Series" onclick={() => deleteSeries(s)}>🗑️</button>
                        </div>
                    </div>
                {/each}
            </div>
            <div class="series-actions">
                <input id="new-series-name" type="text" bind:value={newSeriesName} placeholder="New Series Name" title="New Series Name">
                <div class="series-actions-row">
                    <button id="create-series-btn" class="primary-btn" onclick={createSeries}>Create New</button>
                    <button id="import-series-btn" class="secondary-btn" onclick={() => fileInput.click()}>Import Series</button>
                </div>
                <input id="import-series-input" type="file" bind:this={fileInput} accept=".json" title="Select Series JSON file" style="display:none" onchange={onImport}>
            </div>
            <button id="close-series-modal" class="secondary-btn modal-footer-btn" onclick={onClose}>Close</button>
        </div>
    </div>
{/if}
