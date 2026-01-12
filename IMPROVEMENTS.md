# Code Improvement & Future Goals Report

## 1. Bug Fixes & Code Smells

### 1.1 Dead & Duplicate Code
**File:** `js/app.js`

There is a significant redundancy in the synchronization logic. The function `checkSyncConflict` (Line 1693) appears to be a legacy or unused implementation of conflict resolution that uses blocking `confirm()` dialogs. The active logic seems to be handled by `checkForCloudUpdates` (Line 1391) and `showSyncConflict` (Line 1428), which use a custom modal.

**Code Snippet (Legacy/Dead Code):**
```javascript
// js/app.js:1693
async checkSyncConflict() {
    // ... logic using confirm() ...
    if (confirm(`Cloud data is newer...`)) {
        // ...
    }
}
```

**Recommendation:** Remove `checkSyncConflict` entirely to avoid confusion and potential double-invocation if future maintainers accidentally wire it up.

### 1.2 Hardcoded Credentials
**File:** `js/app.js`

The Google API Client ID is hardcoded in the source. While difficult to avoid entirely in client-side only apps without a build process, it poses a security risk if the repo is public and the ID is not restricted properly in Google Cloud Console.

**Code Snippet:**
```javascript
// js/app.js:437
const CLIENT_ID = '422487925462-sjl9obqg89942k80ntm127d0uvmh2fui.apps.googleusercontent.com';
```

**Recommendation:** Move this to a configuration file (e.g., `config.js`) or use environment variables if a build step (Vite/Webpack) is introduced later. Ensure the Key is restricted to the specific domain in Google Console.

### 1.3 UX: Blocking Alerts & Prompts
**File:** `js/app.js`

The application uses native `alert()` and `prompt()` for critical user interactions like renaming series or deleting items. These block the main thread and provide a poor user experience that cannot be styled.

**Occurrences:**
*   `alert()`: Lines 520, 1105, 1108, 1543, 1546, 1564, 1690.
*   `prompt()`: Lines 1071, 1098, 1522.

**Code Snippet:**
```javascript
// js/app.js:1071
const newName = prompt("Enter new name for the series:", s.name);
```

**Recommendation:** Replace these with custom modals (similar to `series-modal` or `settings-modal`). This will allow for validation, better styling, and non-blocking interaction.

---

## 2. Improvements & Refactoring

### 2.1 Modularization
**File:** `js/app.js`

The `app.js` file is currently a monolithic script containing over 1700 lines. It mixes distinct concerns:
*   `State` Management
*   `Graph` Rendering (SVG)
*   `GoogleDriveSync` Logic
*   `App` (UI Controller)

**Recommendation:** Refactor into ES6 modules:
*   `js/state.js`
*   `js/graph.js`
*   `js/drive.js`
*   `js/ui.js` or `js/main.js`

This will make the codebase easier to maintain, test, and navigate.

### 2.2 Global DOM Selectors
**File:** `js/app.js`

The `els` object (Line 635) maps ID strings to DOM elements globally. If the HTML structure changes, this massive object needs manual updates.

**Recommendation:** Scope DOM lookups to the components that need them (e.g., the `Graph` class should be passed its container, not look it up globally).

---

## 3. Handling Future Goals

### 3.1 Search, Sort & Tags
*   **Implementation Strategy:**
    *   **Data Structure:** Update the `Character` object in `State` class to include a `tags` array (e.g., `['dps', 'fire']`).
    *   **UI:** Add a search input in the sidebar. Create a filter function in `App.renderList()` that filters `this.state.getCharacters()` based on name string matching and tag inclusion.

### 3.2 Factions & Regions
*   **Implementation Strategy:**
    *   **Data Structure:** Add `faction` (string/id) and `region` (string/id) fields to the character data model.
    *   **Assets:** Create a map of Faction ID -> Icon URL.
    *   **UI:** Display the faction icon next to the character name in the list and on the active character overlay.

### 3.3 Interactive World Map
*   **Implementation Strategy:**
    *   **Library:** Use **Leaflet.js** (for raster maps) or **D3.js** (for SVG maps).
    *   **Integration:** Create a new "View" mode in the main area (toggle between Graph and Map).
    *   **Logic:**
        *   Define map coordinates (x, y) for each Region.
        *   Allow assigning characters to a Region.
        *   Render character tokens on the map at their region's coordinates.
