# 🧠 BrainViz - EEG Signal Viewer Chrome Extension

**BrainViz**  is a lightweight Chrome extension designed for researchers, students, and clinicians working with brainwave data. It enables fast and intuitive visualization of EEG signals from `.txt` and `.edf` files directly in the browser, with filtering, channel control, and PSD analysis.

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
* **Python-Powered Filtering**: Uses Pyodide with SciPy for advanced signal processing

### 🎵 Frequency Analysis

* **Power Spectral Density (PSD)**: Generate PSD plots to observe signal frequency patterns
* **Channel-wise PSD**: Analyze frequency band activity per selected channel
* **Overlay Comparison**: Preview multiple channel spectra
* **Band Topomaps**: Visualize Delta, Theta, Alpha, and Beta frequency bands as brain topographic maps

### 📁 File Management

* **Download Detection**: Intercepts `.edf` or `.txt` EEG downloads for instant preview
* **Storage Fallbacks**: Uses IndexedDB and Chrome storage for large file handling

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
  * Toggle Topomap on PSD Screen

### 3. Analyze the Signal

* Use the slider to scroll across the EEG timeline
* Click "Show PSD" for frequency analysis
* View brain topomaps for different frequency bands
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
├── icons/                         # Extension icons
│   ├── Brainviz16.png
│   ├── Brainviz48.png
│   └── Brainviz128.png
│
├── libs/                          # JavaScript libraries and Python packages
│   ├── EdfDecoder.js              # EDF file decoder
│   ├── jsEDF.js                   # JavaScript EDF parser
│   ├── plotly.min.js              # Plotly.js for data visualization
│   ├── pyodide.js                 # Python in the browser runtime
│   ├── pyodide.asm.js             # Pyodide WebAssembly interface
│   ├── pyodide.asm.wasm           # Pyodide WebAssembly binary
│   ├── pyodide-lock.json          # Pyodide package lock file
│   ├── python_stdlib.zip          # Python standard library
│   ├── numpy-1.26.4-cp311-cp311-emscripten_3_1_46_wasm32.whl  # NumPy for signal processing
│   ├── scipy-1.11.2-cp311-cp311-emscripten_3_1_46_wasm32.whl  # SciPy for filtering
│   └── openblas-0.3.23.zip        # Linear algebra library
│
├── background.js                 # Service worker (background logic)
├── contentScript.js              # Injected into pages to enable EEG detection
├── eegStorage.js                 # Handles large file storage using IndexedDB
├── index.html                    # Extension popup UI
├── manifest.json                 # Extension configuration (Manifest v3)
├── popup.js                      # Logic for popup panel and file upload
├── scriptInjector.js             # Injects scripts into web pages for EEG detection
├── viewer.html                   # EEG viewer interface
├── viewer.js                     # EEG signal rendering and analysis logic
├── privacy-policy.md             # Privacy policy for Chrome Web Store
└── README.md                     # Project documentation
```

## ⚠️ Known Issues

- Interception may fail if page disables content scripts or uses custom download logic.

## 🧰 Troubleshooting

| Issue                        | Solution                                                             |
|-----------------------------|----------------------------------------------------------------------|
| EEG file is downloaded      | Check that "Intercept Downloads" is ON in the popup                 |
| Viewer shows "No Data"      | Make sure your file has valid headers and numeric rows              |
| Content not displaying      | File may be HTML or invalid EEG data (check devtools/network tab)   |
| Not working on some pages   | Some domains restrict extension scripts (e.g. chrome:// or sandboxed pages) |
| Python engine not ready     | Wait a few seconds for Pyodide to initialize before using filters   |
| Topomaps not showing   | Ensure at least 3 channels are selected and mappable to electrode positions |

## Development

### Build

No npm build step required. This is a vanilla JS/HTML/CSS extension using Chrome Extension Manifest V3 with Pyodide for Python functionality.

To test changes:

- Reload extension in `chrome://extensions/`
- Click icon and try file upload or download interception

### Debugging

* Open Chrome DevTools on viewer.html or popup
* Use `console.log()` in background.js and viewer.js to trace events
* Monitor `chrome://extensions/` for errors

## Privacy Policy

This extension processes EEG files locally in your browser using client-side Python via Pyodide. No user-identifiable data is collected, transmitted, or stored on external servers. All signal processing happens entirely within your browser.

## Support & Contributions

* Report issues via [GitHub Issues](https://github.com/qquais/brainviz/issues)
* For feature requests or academic collaboration, contact: [support@mieweb.org](mailto:support@mieweb.org)

## Acknowledgments

* Supported by [MIE](https://mieweb.org/)
* JavaScript Libraries:

  * [Plotly.js](https://plotly.com/javascript/)- Interactive data visualization
  * jsEDF.js - JavaScript EDF file parser
  * EdfDecoder.js - Additional EDF decoding capabilities

* Python in Browser:

  * Pyodide - Python scientific stack in WebAssembly
  * NumPy - Numerical computing for signal processing
  * SciPy - Scientific computing and signal filtering
  * OpenBLAS - Optimized linear algebra library

* EEG Dataset Support:

  * Testing with [PhysioNet](https://physionet.org/) datasets
  * 10-20 International System electrode positioning

* Browser APIs:

  * Chrome Extension APIs (Storage, Downloads, Tabs)
  * IndexedDB for large file handling
  * Web Workers for background processing

## Project Demo

* [Link](https://www.youtube.com/shorts/jqH67MbXUoo)

