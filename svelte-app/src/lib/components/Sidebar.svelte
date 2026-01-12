<script>
    import { appState } from '$lib/stores/state.svelte.js';

    // Props
    let {
        activeId,
        onSelectChar,
        onSelectSeries,
        onAddChar,
        onOpenSettings
    } = $props();

    let activeSeries = $derived(appState.activeSeries);
    let characters = $derived(appState.characters);

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
</script>

<aside class="sidebar glass-panel">
    <div class="sidebar-header">
        <div class="series-select-container">
            <button id="series-btn" class="series-btn" title="Switch Series" onclick={onSelectSeries}>
                <span id="current-series-name">{activeSeries ? activeSeries.name : 'Loading...'}</span>
                <span class="chevron">▼</span>
            </button>
        </div>
        <div class="actions">
            <button id="add-char-btn" class="add-btn-premium" title="Add Character" onclick={onAddChar}>+</button>
            <button id="settings-btn" class="icon-btn" title="Series Settings" onclick={onOpenSettings}>⚙️</button>
        </div>
    </div>
    <div id="character-list" class="character-list">
        {#if characters.length === 0}
            <div class="empty-roster">No characters in <br>"{activeSeries ? activeSeries.name : ''}"</div>
        {:else}
            {#each characters as char (char.id)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="char-item {activeId === char.id ? 'active' : ''}" onclick={() => onSelectChar(char.id)}>
                    <div class="char-info-row" style="display:flex; align-items:center; gap:10px; flex:1">
                        <img src={getOptimizedUrl(char.image) || getPlaceholder(char.name)}
                             class="char-thumb"
                             alt={char.name}
                             loading="lazy"
                             onerror={(e) => e.target.src = getPlaceholder(char.name)}>
                        <span>{char.name}</span>
                    </div>
                    <div class="char-actions-row">
                        <button class="icon-btn xs-btn edit-btn" title="Edit" onclick={(e) => { e.stopPropagation(); onSelectChar(char.id, true); }}>✎</button>
                        <button class="icon-btn xs-btn del-btn" title="Delete" onclick={(e) => { e.stopPropagation(); if(confirm(`Delete ${char.name}?`)) appState.deleteCharacter(char.id); }}>🗑️</button>
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</aside>
