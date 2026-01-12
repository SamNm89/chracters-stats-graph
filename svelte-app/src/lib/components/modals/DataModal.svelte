<script>
    import { appState } from '$lib/stores/state.svelte.js';
    import { GoogleDriveSync } from '$lib/googleDrive.js';
    import { onMount } from 'svelte';

    let { isOpen, onClose, onImportJson, onImportConflict } = $props();

    let drive = $state(null);
    let isSignedIn = $state(false);
    let userEmail = $state('Not available');
    let syncStatusText = $derived(appState.isDirty ? 'Outdated' : 'Synced');
    let syncStatusColor = $derived(appState.isDirty ? '#f97316' : '#10b981');
    let lastSync = $derived(appState.lastSync ? new Date(appState.lastSync).toLocaleString() : 'Never');
    let fileInput = $state(null);

    onMount(() => {
        drive = new GoogleDriveSync({
            onSignIn: async () => {
                isSignedIn = true;
                const profile = await drive.getUserProfile();
                if (profile) userEmail = profile.email;
                checkSync();
            },
            onSignedOut: () => {
                isSignedIn = false;
                userEmail = 'Not available';
            }
        });
        drive.init();
    });

    async function checkSync() {
        if (!isSignedIn) return;

        const remoteFile = await drive.findBackupFile();
        if (!remoteFile) {
             await drive.saveToCloud(appState.data);
             appState.markSynced();
             return;
        }

        const remoteData = await drive.downloadFile(remoteFile.id);
        if (!remoteData) return;

        const localUpdated = appState.data.lastUpdated || 0;
        const remoteUpdated = remoteData.lastUpdated || 0;

        const diff = remoteUpdated - localUpdated;

        if (diff > 2000) {
             if (confirm(`Cloud data is newer than local data.\n\nCloud: ${new Date(remoteUpdated).toLocaleString()}\nLocal: ${new Date(localUpdated).toLocaleString()}\n\nOverwrite local with Cloud data?`)) {
                localStorage.setItem('csg_data_v2', JSON.stringify(remoteData));
                window.location.reload();
            }
        } else if (localUpdated - remoteUpdated > 2000) {
            await drive.saveToCloud(appState.data);
            appState.markSynced();
        } else {
            appState.markSynced();
        }
    }

    function connect() {
        drive.handleAuthClick();
    }

    function syncNow() {
        if (!isSignedIn) return;
        drive.saveToCloud(appState.data).then(() => {
            appState.markSynced();
        });
    }

    function signOut() {
        if (confirm("Sign out from Google Drive?")) {
            drive.signOut();
        }
    }

    function exportJson() {
        const dataStr = JSON.stringify(appState.data, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportFileDefaultName = `csg_backup_${new Date().toISOString().split('T')[0]}.json`;
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    }

</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div id="data-modal" class="modal" onclick={(e) => { if(e.target === e.currentTarget) onClose(); }}>
        <div class="modal-content glass-panel">
            <h2>Data Management</h2>
            <p class="modal-subtitle">Sync your data to the cloud or manage local backups.</p>

            <div class="data-options">
                <div class="data-option-card drive-card {isSignedIn ? 'connected' : ''}">
                    <div class="sync-card-header">
                        <div class="title-with-icon">
                            <h4>☁️ Google Drive Sync</h4>
                        </div>
                        <div id="sync-status-indicator" class="sync-indicator {appState.isDirty ? 'outdated' : 'synced'}" title={syncStatusText}></div>
                    </div>

                    <div class="drive-info">
                        <p class="privacy-note">This app uses a private <strong>Application Data</strong> folder on your
                            drive to save and sync rosters. It can only read/write files this site created.</p>

                        {#if isSignedIn}
                        <div id="sync-details" class="sync-details">
                            <div class="detail-row">
                                <span class="sync-label">Account:</span>
                                <span id="sync-user-email" class="user-email-reveal" title="Hover to reveal">{userEmail}</span>
                            </div>
                            <div class="detail-row">
                                <span class="sync-label">Sync Status:</span>
                                <span id="sync-status-text" class="status-value" style="color: {syncStatusColor}">{syncStatusText}</span>
                            </div>
                            <div class="detail-row">
                                <span class="sync-label">Last Sync:</span>
                                <span id="last-sync-time" class="sync-time">{lastSync}</span>
                            </div>
                        </div>
                        {/if}
                    </div>

                    <div class="drive-actions">
                        {#if !isSignedIn}
                        <button id="sync-btn" class="primary-btn" onclick={connect}>
                            <svg viewBox="0 0 24 24" class="btn-icon">
                                <path d="M7.71,3.5L1.15,15L4.58,21L11.13,9.5M9.73,15L6.3,21H19.42L22.85,15M22.28,14L15.42,2H8.58L8.57,2L15.43,14H22.28Z"></path>
                            </svg>
                            <span>Connect & Sync</span>
                        </button>
                        {:else}
                        <button id="sync-btn" class="secondary-btn" onclick={syncNow}>Sync Now</button>
                        <button id="sign-out-btn" class="secondary-btn" onclick={signOut}>Sign Out</button>
                        {/if}
                    </div>
                </div>

                <div class="data-option-card">
                    <h4>📥 Local Backup</h4>
                    <p>Download your data as a JSON file or restore from one.</p>
                    <div class="modal-actions-grid">
                        <button id="export-json-btn" class="secondary-btn" onclick={exportJson}>Export JSON</button>
                        <button id="import-json-btn" class="secondary-btn" onclick={() => fileInput.click()}>Import JSON</button>
                    </div>
                </div>
            </div>

            <input id="import-input" type="file" bind:this={fileInput} accept=".json" title="Import JSON File" style="display:none" onchange={onImportJson}>

            <div class="modal-actions">
                <button id="close-data-modal" class="secondary-btn modal-footer-btn" onclick={onClose}>Close</button>
            </div>
        </div>
    </div>
{/if}
