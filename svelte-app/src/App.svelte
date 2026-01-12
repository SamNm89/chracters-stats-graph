<script>
    import { appState } from '$lib/stores/state.svelte.js';
    import Graph from '$lib/components/Graph.svelte';
    import Sidebar from '$lib/components/Sidebar.svelte';
    import Editor from '$lib/components/Editor.svelte';
    import SeriesModal from '$lib/components/modals/SeriesModal.svelte';
    import SettingsModal from '$lib/components/modals/SettingsModal.svelte';
    import DataModal from '$lib/components/modals/DataModal.svelte';
    import ImportReviewModal from '$lib/components/modals/ImportReviewModal.svelte';

    let activeCharId = $state(null);
    let editorOpen = $state(false);
    let editingId = $state(null);

    // Modals
    let seriesModalOpen = $state(false);
    let settingsModalOpen = $state(false);
    let dataModalOpen = $state(false);
    let importReviewModalOpen = $state(false);
    let importedData = $state(null);

    // Derived
    let activeChar = $derived(appState.getCharacter(activeCharId));
    let settings = $derived(appState.settings);
    let bgImage = $derived(activeChar?.bgImage);

    // Graph needs explicit stats to animate
    let graphStats = $derived(activeChar ? activeChar.stats : new Array(settings.dimensions).fill(0));

    function getOptimizedUrl(url, options = {}) {
         if (!url || typeof url !== 'string') return null;
        if (!url.startsWith('http')) return url;
        const cleanUrl = url.replace(/^https?:\/\//, '');
        const params = new URLSearchParams({
            url: cleanUrl,
            noproxy: '1',
            default: url,
            ...options
        });
        return `https://images.weserv.nl/?${params.toString()}`;
    }

    function selectCharacter(id, edit = false) {
        activeCharId = id;
        if (edit) {
            editingId = id;
            editorOpen = true;
        }
    }

    function addCharacter() {
        editingId = null;
        editorOpen = true;
    }

    function closeEditor(savedId) {
        editorOpen = false;
        if (savedId) {
             activeCharId = savedId;
        } else if (savedId === null && editingId) {
            // if deleted
            activeCharId = null;
        }
    }

    function handleImportJson(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (!data.series) throw new Error("Missing series data");
                importedData = data;
                importReviewModalOpen = true;
                dataModalOpen = false; // Close data modal
            } catch (err) {
                alert("Invalid JSON file: " + err.message);
            }
            e.target.value = '';
        };
        reader.readAsText(file);
    }

    function handleImportSeries(e) {
         const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                let seriesData = null;
                let originalName = "";

                if (imported.settings && imported.characters) {
                    seriesData = imported;
                    originalName = imported.name || "Imported Series";
                } else if (imported.series && Object.keys(imported.series).length > 0) {
                    const firstId = imported.activeSeriesId || Object.keys(imported.series)[0];
                    seriesData = imported.series[firstId];
                    originalName = seriesData.name;
                }

                if (!seriesData) throw new Error("Invalid series format");

                const newName = prompt("Rename series before import?", originalName);
                if (newName === null) return;

                const finalName = newName.trim() || originalName;
                const newId = crypto.randomUUID();

                appState.data.series[newId] = {
                    name: finalName,
                    settings: JSON.parse(JSON.stringify(seriesData.settings)),
                    characters: seriesData.characters.map(c => ({
                        ...c,
                        id: crypto.randomUUID()
                    }))
                };

                appState.save();
                appState.switchSeries(newId);

                seriesModalOpen = false;
                alert(`Series "${finalName}" imported successfully!`);

            } catch (err) {
                alert("Invalid Series JSON: " + err.message);
            }
            e.target.value = '';
        };
        reader.readAsText(file);
    }

    // Keyboard navigation
    function handleKeydown(e) {
         // Global Escape to close active modals
        if (e.key === 'Escape') {
            if (settingsModalOpen) settingsModalOpen = false;
            else if (seriesModalOpen) seriesModalOpen = false;
            else if (dataModalOpen) dataModalOpen = false;
            else if (importReviewModalOpen) importReviewModalOpen = false;
            else if (editorOpen) editorOpen = false;
        }

        if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            if (editorOpen || settingsModalOpen || seriesModalOpen || dataModalOpen || importReviewModalOpen) return;

            e.preventDefault();
            const chars = appState.characters;
            if (chars.length === 0) return;

            let idx = chars.findIndex(c => c.id === activeCharId);

            if (e.key === 'ArrowUp') {
                idx = (idx <= 0) ? chars.length - 1 : idx - 1;
            } else if (e.key === 'ArrowDown') {
                idx = (idx === -1 || idx >= chars.length - 1) ? 0 : idx + 1;
            }

            selectCharacter(chars[idx].id);
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="app-container">
    <button id="open-data-modal-btn" class="sync-btn-fixed cloud-btn" title="Storage & Sync" onclick={() => dataModalOpen = true}>
        ☁️
    </button>

    <!-- Sidebar: Character List -->
    <Sidebar
        activeId={activeCharId}
        onSelectChar={selectCharacter}
        onSelectSeries={() => seriesModalOpen = true}
        onAddChar={addCharacter}
        onOpenSettings={() => settingsModalOpen = true}
    />

    <!-- Main View: Graph & Details -->
    <main class="main-view">
        <div id="graph-container" class="graph-container glass-panel {bgImage ? 'has-bg' : ''}"
             style:background-image={bgImage ? `url('${getOptimizedUrl(bgImage, { w: 1280, q: 60 })}')` : 'none'}>

            <Graph
                width={500}
                height={500}
                stats={graphStats}
                {settings}
            />

            <div class="character-info-overlay">
                <div id="active-image-container" class="char-portrait">
                     {#if activeChar}
                        <img src={getOptimizedUrl(activeChar.image, { w: 400, h: 400, fit: 'cover' }) || `https://ui-avatars.com/api/?name=${encodeURIComponent(activeChar.name)}&size=200&background=random`}
                             class="portrait-img"
                             alt={activeChar.name}
                             loading="lazy"
                             onerror={(e) => e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(activeChar.name)}&size=200&background=random`}>
                     {/if}
                </div>
                <h1 id="active-name">{activeChar ? activeChar.name : 'Select a Character'}</h1>
                {#if activeChar}
                    <button id="edit-current-btn" class="icon-btn" title="Edit" onclick={() => selectCharacter(activeCharId, true)}>✎</button>
                {/if}
            </div>
        </div>

        {#if editorOpen}
            <Editor charId={editingId} onClose={closeEditor} />
        {/if}
    </main>
</div>

<SeriesModal
    isOpen={seriesModalOpen}
    onClose={() => seriesModalOpen = false}
    onImport={handleImportSeries}
/>

<SettingsModal
    isOpen={settingsModalOpen}
    onClose={() => settingsModalOpen = false}
/>

<DataModal
    isOpen={dataModalOpen}
    onClose={() => dataModalOpen = false}
    onImportJson={handleImportJson}
/>

<ImportReviewModal
    isOpen={importReviewModalOpen}
    {importedData}
    onClose={() => importReviewModalOpen = false}
/>
