# 🧠 BrainViz - EEG Signal Viewer Chrome Extension

**BrainViz**  is a lightweight Chrome extension designed for researchers, students, and clinicians working with brainwave data. It enables fast and intuitive visualization of EEG signals from `.txt` and `.edf` files directly in the browser, with filtering, channel control, and PSD analysis.

---

## Features

### 🚀 Core EEG Viewer

* **.edf and .txt Support**: Upload EEG signals from common biomedical formats
* **Auto File Interception**: Detects and opens EEG downloads from PhysioNet and similar sources
* **Offline File Viewer**: Manually upload files via the popup panel
* **Interactive UI**: Play, scroll, and zoom through signal windows

### 🧠 Signal Processing

* **Channel Selection**: Toggle and focus on individual EEG channels
* **Stacked & Compact Modes**: Choose between clinical-style or overlay visualization
* **Filtering Tools**: Apply bandpass, lowpass, highpass, or notch filters (50Hz/60Hz)
* **Real-Time Time Slider**: Navigate large EEG datasets with a draggable canvas-based slider

### 🎵 Frequency Analysis

* **Power Spectral Density (PSD)**: Generate PSD plots to observe signal frequency patterns
* **Channel-wise PSD**: Analyze frequency band activity per selected channel
* **Overlay Comparison**: Preview multiple channel spectra

### 📁 File Management

* **Download Detection**: Intercepts `.edf` or `.txt` EEG downloads for instant preview
* **Storage Fallbacks**: Uses IndexedDB and Chrome storage for large file handling

---

## 📦 Installation

### 🔗 From Chrome Web Store (Coming Soon)

### 🧪 Developer Installation

1. Clone this repository:

```bash
git clone https://github.com/your-username/brainviz.git
cd brainviz
```

2. Load in Chrome:

* Open `chrome://extensions/`
* Enable **Developer Mode**
* Click **Load unpacked** and select the root project folder

## Quick Start

### 1. Open the Extension

* Click the BrainViz icon in your Chrome toolbar
* Use the popup to upload an EEG file manually or intercept a download

### 2. Launch the EEG Viewer

* EEG files auto-open the signal viewer UI
* Use the top menu to:

  * Select channels
  * Apply filters
  * Toggle PSD or stacked mode

### 3. Analyze the Signal

* Use the slider to scroll across the EEG timeline
* Click "Show PSD" for frequency analysis
* Export results or view channel overlays

## Viewer Functions

### Signal Display

* View multiple channels aligned with timestamp labels
* Adjust signal amplitude scale (e.g., 2 µV/mm)
* Switch between compact/stacked view

### Controls

* Filter dropdowns
* PSD toggle button
* Canvas-based EEG window slider
* Channel checkbox panel

### File Types

* `.edf` (standard EEG format)
* `.txt` (structured signal arrays)

## Project Structure

```
BrainViz/
├── flask-server/                   # Backend Flask server (MCP server)
│   └── mcp_server.py              # Flask app for EEG processing via MNE
│   └── requirements.txt           # Python dependencies
│
├── public/                        # Chrome extension frontend
│   ├── icons/                     # Extension icons (16x16, 48x48, 128x128)
│   │   ├── Brainviz16.png
│   │   ├── Brainviz48.png
│   │   └── Brainviz128.png
│   │
│   ├── libs/                      # JS libraries (e.g., Plotly)
│   │   └── plotly.min.js
│   │
│   ├── background.js              # Service worker (background logic)
│   ├── contentScript.js          # Injected into pages to enable EEG view
│   ├── eegStorage.js             # Handles file storage and transfer
│   ├── index.html                # Extension popup UI
│   ├── manifest.json             # Extension configuration (Manifest v3)
│   ├── popup.js                  # Logic for popup panel
│   ├── scriptInjector.js         # Injects scripts into tab
│   ├── viewer.html               # EEG viewer interface
│   └── viewer.js                 # EEG signal rendering logic
│
├── privacy-policy.md             # Privacy policy for Chrome Web Store
└── README.md                     # Project documentation
```

## Backend Server

BrainViz connects to a Flask-based **MCP server** hosted at:

```
https://brainviz.opensource.mieweb.org
```

This server (via `mcp_server.py`) performs EEG preprocessing:

* Filter application
* PSD calculation
* Channel data extraction

---

## ⚠️ Known Issues

- Interception may fail if page disables content scripts or uses custom download logic.

---

## 🧰 Troubleshooting

| Issue                        | Solution                                                             |
|-----------------------------|----------------------------------------------------------------------|
| EEG file is downloaded      | Check that "Intercept Downloads" is ON in the popup                 |
| Viewer shows "No Data"      | Make sure your file has valid headers and numeric rows              |
| Content not displaying      | File may be HTML or invalid EEG data (check devtools/network tab)   |
| Not working on some pages   | Some domains restrict extension scripts (e.g. chrome:// or sandboxed pages) |

---

## Development

### Build

No npm build step required. This is a vanilla JS/HTML/CSS extension using Chrome Extension Manifest V3.

To test changes:

- Reload extension in `chrome://extensions/`
- Click icon and try file upload or download interception

### Debugging

* Open Chrome DevTools on viewer.html or popup
* Use `console.log()` in background.js and viewer.js to trace events
* Monitor `chrome://extensions/` for errors

## Privacy Policy

This extension processes EEG files locally in your browser and communicates only with the BrainViz MCP server to perform signal processing. No user-identifiable data is collected, transmitted, or stored.

## Support & Contributions

* Report issues via [GitHub Issues](https://github.com/mieweb/brainviz/issues)
* For feature requests or academic collaboration, contact: [support@mieweb.org](mailto:support@mieweb.org)

## Acknowledgments

* Built by [MIE](https://www.mieweb.org)
* Uses [MNE-Python](https://mne.tools/stable/index.html) (via backend)
* EEG dataset support tested on [PhysioNet](https://physionet.org/)
* Powered by [Plotly.js](https://plotly.com/javascript/)

---

**Version**: 1.0.0
**Manifest**: v3
**Minimum Chrome Version**: 88+
