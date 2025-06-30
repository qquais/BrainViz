# 🧠 EEG Reader - Chrome Extension

**EEG Reader** is a Chrome extension that automatically detects, intercepts, and visualizes EEG signal files directly in the browser. It supports `.txt`, `.edf`, `.csv`, and `.zip` EEG data formats and provides an intuitive interface for both automatic and manual visualization.

---

## 🚀 Features

### ✅ Download Interception
- Automatically detects EEG downloads (e.g. from PhysioNet)
- Cancels the download and opens EEG data in a visual viewer
- Smart detection avoids false positives (e.g. README or LICENSE files)

### 📈 EEG Visualization
- Interactive EEG plot using **Plotly.js**
- Supports zoom, pan, tooltips, and responsive layout
- Plots EEG signal amplitude over time

### 🧪 Manual Upload
- Drag and drop `.txt` EEG files via the popup panel
- Instantly renders visualization without needing to download

### ⚙️ Additional Tools
- Toggle interception ON/OFF from popup
- Clear stored EEG data anytime
- Handles CORS errors and content-type validation gracefully

---

## 📦 Installation

### 🔗 From Chrome Web Store (Coming Soon)

### 🧪 Developer Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/eeg-reader-extension.git
   cd eeg-reader-extension
   ```

2. Open Google Chrome and navigate to:
   ```
   chrome://extensions/
   ```

3. Enable **Developer Mode**

4. Click **Load unpacked** and select the extension root directory

---

## 🧠 Usage

### 1. Auto-Intercept EEG Downloads
- Visit a site such as [PhysioNet](https://physionet.org/)
- Click on a `.txt`, `.edf`, `.csv`, or `.zip` EEG file
- Extension intercepts the download and opens the viewer in a new tab

### 2. Upload EEG Files Manually
- Click the EEG Reader icon in the Chrome toolbar
- In the popup, click the upload area and choose a `.txt` file
- EEG Viewer will open in a new tab with plotted data

---

## 📁 File Structure

```
eeg-reader-extension/
├── background.js         # Handles download events and file interception
├── contentScript.js      # Communicates between page and extension
├── scriptInjector.js     # Injected script for link detection and interception
├── index.html            # Extension popup UI
├── popup.js              # Popup functionality (toggle, upload)
├── viewer.html           # EEG data viewer page
├── viewer.js             # Signal parsing and Plotly plotting
├── manifest.json         # Extension metadata and config
└── libs/
    └── plotly.min.js     # (Optional) Plotly library (CDN or bundle)
```

---

## 🔢 Supported Data Format

The EEG signal file must be in simple tabular format:

```
Time,Signal
0.001,14.5
0.002,15.1
...
```

- First row: headers
- Column 1: Time (in seconds)
- Column 2: Signal amplitude (in microvolts)

---

## ⚠️ Known Issues

- Viewer only loads `.txt` manually (intercept handles `.edf`, `.csv`, `.zip`)
- Does not support multi-channel EEG yet
- Interception may fail if page disables content scripts or uses custom download logic

---

## 🧰 Troubleshooting

| Issue                        | Solution                                                             |
|-----------------------------|----------------------------------------------------------------------|
| EEG file is downloaded      | Check that "Intercept Downloads" is ON in the popup                 |
| Viewer shows "No Data"      | Make sure your file has valid headers and numeric rows              |
| Content not displaying      | File may be HTML or invalid EEG data (check devtools/network tab)   |
| Not working on some pages   | Some domains restrict extension scripts (e.g. chrome:// or sandboxed pages) |

---

## 📊 Visualization Details

- Uses **Plotly.js** for rendering EEG charts
- Limits plot to first 5000 rows for performance
- Responsive and mobile-friendly design

---

## 🧑‍💻 Development

To build or modify:

```bash
# Start dev mode
npm install
npm run dev

# Build production files
npm run build
```

To test changes:

- Reload extension in `chrome://extensions/`
- Click icon and try file upload or download interception

---

## 📜 License

MIT License

---

## 🙌 Acknowledgements

- [PhysioNet](https://physionet.org/) for public EEG datasets
- Built with 🧠 by the **MIE EEG Project Team**
- Powered by [Chrome Extensions API](https://developer.chrome.com/docs/extensions/)
- Visualizations by [Plotly.js](https://plotly.com/javascript/)

---

## 📌 Version

- Extension Version: **1.4**
- Manifest: **v3**
- Minimum Chrome: **88+**
