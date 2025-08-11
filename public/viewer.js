let eegData = null;
let sampleRate = 256;
let windowSize = 10;
let maxWindow = 0;
let currentFileName = "Unknown File";
let isStackedView = true;
let psdVisible = false;
let timeSliderCanvas = null;
let sliderCtx = null;
let dragging = false;
let windowStartSec = 0;
let totalDurationSec = 0;

// Electrode positions (10-20 system)
const ELECTRODE_POSITIONS = {
    'FP1': [-0.06, 0.08, 0.05], 'FP2': [0.06, 0.08, 0.05], 'FPZ': [0.0, 0.08, 0.05],
    'AF3': [-0.04, 0.07, 0.05], 'AF4': [0.04, 0.07, 0.05], 'AFZ': [0.0, 0.07, 0.05],
    'F7': [-0.08, 0.03, 0.02], 'F3': [-0.05, 0.05, 0.04], 'FZ': [0.0, 0.05, 0.06],
    'F4': [0.05, 0.05, 0.04], 'F8': [0.08, 0.03, 0.02],
    'FC5': [-0.07, 0.02, 0.03], 'FC3': [-0.04, 0.03, 0.05], 'FC1': [-0.03, 0.02, 0.05],
    'FCZ': [0.0, 0.02, 0.06], 'FC2': [0.03, 0.02, 0.05], 'FC4': [0.04, 0.03, 0.05], 'FC6': [0.07, 0.02, 0.03],
    'T7': [-0.08, 0.0, 0.0], 'C5': [-0.07, 0.0, 0.02], 'C3': [-0.05, 0.0, 0.04], 'C1': [-0.025, 0.0, 0.05],
    'CZ': [0.0, 0.0, 0.06], 'C2': [0.025, 0.0, 0.05], 'C4': [0.05, 0.0, 0.04], 'C6': [0.07, 0.0, 0.02], 'T8': [0.08, 0.0, 0.0],
    'CP5': [-0.07, -0.02, 0.03], 'CP3': [-0.04, -0.03, 0.05], 'CP1': [-0.03, -0.02, 0.05],
    'CPZ': [0.0, -0.02, 0.06], 'CP2': [0.03, -0.02, 0.05], 'CP4': [0.04, -0.03, 0.05], 'CP6': [0.07, -0.02, 0.03],
    'P7': [-0.08, -0.03, 0.02], 'P5': [-0.06, -0.04, 0.03], 'P3': [-0.05, -0.05, 0.04], 'P1': [-0.03, -0.06, 0.05],
    'PZ': [0.0, -0.05, 0.06], 'P2': [0.03, -0.06, 0.05], 'P4': [0.05, -0.05, 0.04], 'P6': [0.06, -0.04, 0.03], 'P8': [0.08, -0.03, 0.02],
    'PO7': [-0.06, -0.06, 0.02], 'PO3': [-0.04, -0.07, 0.03], 'POZ': [0.0, -0.07, 0.05], 'PO4': [0.04, -0.07, 0.03], 'PO8': [0.06, -0.06, 0.02],
    'O1': [-0.03, -0.08, 0.02], 'OZ': [0.0, -0.08, 0.04], 'O2': [0.03, -0.08, 0.02], 'IZ': [0.0, -0.09, 0.01],
    'T3': [-0.08, 0.0, 0.0], 'T4': [0.08, 0.0, 0.0], 'T5': [-0.08, -0.03, 0.02], 'T6': [0.08, -0.03, 0.02],
    'FT7': [-0.08, 0.02, 0.01], 'FT8': [0.08, 0.02, 0.01], 'FT9': [-0.09, 0.01, 0.01], 'FT10': [0.09, 0.01, 0.01],
    'TP7': [-0.08, -0.02, 0.01], 'TP8': [0.08, -0.02, 0.01],
};

// Frequency ranges
const FREQUENCY_BANDS = {
    'Delta (1-4 Hz)': [1, 4],
    'Theta (4-8 Hz)': [4, 8], 
    'Alpha (8-13 Hz)': [8, 13],
    'Beta (13-40 Hz)': [13, 40]
};

/**
 * Show errors to user.
 */
function showError(msg) {
  let errorDiv = document.getElementById("errorMsg");
  if (!errorDiv) {
    errorDiv = document.createElement("div");
    errorDiv.id = "errorMsg";
    errorDiv.style = "color:red; padding:1em;";
    document.body.prepend(errorDiv);
  }
  errorDiv.innerHTML = msg;
}

/**
 * Initialization logic — main entry point
 */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initializeViewer();
  } catch (error) {
    showError(`Initialization failed: ${error.message}`);
  }

  // Set up Select All/Unselect All button handlers
  const selectAllBtn = document.getElementById("selectAllBtn");
  const unselectAllBtn = document.getElementById("unselectAllBtn");
  if (selectAllBtn && unselectAllBtn) {
    selectAllBtn.onclick = function () {
      document
        .querySelectorAll("#channelList input[type=checkbox]")
        .forEach((cb) => (cb.checked = true));
      plotCurrentWindow();
      if (psdVisible) {
        updatePSDPlot(getSelectedChannels());
      }
    };
    unselectAllBtn.onclick = function () {
      document
        .querySelectorAll("#channelList input[type=checkbox]")
        .forEach((cb) => (cb.checked = false));
      plotCurrentWindow();
      if (psdVisible) {
        updatePSDPlot(getSelectedChannels());
      }
    };
  }
});

async function initializeViewer() {
  if (typeof Plotly === "undefined") throw new Error("Plotly.js not loaded");
  const eegStore = new EEGStorage();

  // --- EDF/BDF first using jsEDF.js ---
  const edfDataRec = await eegStore.getEDFFile();
  if (edfDataRec && edfDataRec.data) {
    try {
      const buffer =
        edfDataRec.data instanceof ArrayBuffer
          ? edfDataRec.data
          : new Uint8Array(edfDataRec.data).buffer;
      if (window.EDF) {
        const edf = new window.EDF(new Uint8Array(buffer));
        const labels = [];
        for (let i = 0; i < edf.realChannelCount; i++) {
          labels.push(edf.channels[i].label);
        }
        // Use the raw .data arrays for full signals
        const signals = [];
        for (let i = 0; i < edf.realChannelCount; i++) {
          signals.push(edf.channels[i].data);
        }
        const sampleRate_local =
          edf.sampling_rate || edf.channels[0].num_samples / edf.duration;
        currentFileName = edfDataRec.filename || "Unknown File";
        totalDurationSec = Math.floor(signals[0].length / sampleRate_local);

        eegData = {
          channel_names: labels,
          sample_rate: sampleRate_local,
          signals: signals,
        };

        sampleRate = sampleRate_local;
        windowSize = 10;
        maxWindow = Math.max(0, totalDurationSec - windowSize);
        windowStartSec = 0;

        updateUIAfterFileLoad(labels, totalDurationSec);

        document.getElementById("toggleViewBtn").onclick = () => {
          isStackedView = !isStackedView;
          document.getElementById("toggleViewBtn").textContent = isStackedView
            ? "Switch to Compact View"
            : "Switch to Stacked View";
          plotCurrentWindow();
        };
        document
          .getElementById("applyFilter")
          .addEventListener("click", async () => {
            await filterInBrowser();
          });
        document
          .getElementById("showPsdBtn")
          .addEventListener("click", handlePsdToggle);
        
        // Enable topomap functionality
        const multiTopoBtn = document.getElementById("topomapMultiBtn");
        if (multiTopoBtn) {
          multiTopoBtn.disabled = false;
          // multiTopoBtn.title = "Show frequency topomaps";
          multiTopoBtn.onclick = showBandTopomaps;
        }
        
        return;
      } else {
        showError("jsEDF library not loaded.");
        return;
      }
    } catch (e) {
      showError("Failed to parse EDF/BDF in browser: " + e.message);
      return;
    }
  }

  // --- Try TXT fallback ---
  try {
    const db = await eegStore.openDB();
    const tx = db.transaction(["eegFiles"], "readonly");
    const store = tx.objectStore("eegFiles");
    const request = store.get("current_text");
    const textResult = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (textResult && textResult.data) {
      currentFileName = textResult.filename || "Unknown File";
      const parsed = parseTxtEEG(textResult.data);
      eegData = parsed;
      sampleRate = parsed.sample_rate;
      totalDurationSec = Math.floor(parsed.signals[0].length / sampleRate);
      windowSize = 10;
      maxWindow = Math.max(0, totalDurationSec - windowSize);
      windowStartSec = 0;
      updateUIAfterFileLoad(parsed.channel_names, totalDurationSec);
      document.getElementById("toggleViewBtn").onclick = () => {
        isStackedView = !isStackedView;
        document.getElementById("toggleViewBtn").textContent = isStackedView
          ? "Switch to Compact View"
          : "Switch to Stacked View";
        plotCurrentWindow();
      };
      document
        .getElementById("applyFilter")
        .addEventListener("click", async () => {
          await filterInBrowser();
        });
      document
        .getElementById("showPsdBtn")
        .addEventListener("click", handlePsdToggle);
      
      // Enable topomap functionality for TXT files too
      const multiTopoBtn = document.getElementById("topomapMultiBtn");
      if (multiTopoBtn) {
        multiTopoBtn.disabled = false;
        multiTopoBtn.title = "Show frequency topomaps";
        multiTopoBtn.onclick = showBandTopomaps;
      }
      
      return;
    } else {
      showError("No EEG data found in IndexedDB.");
    }
  } catch (e) {
    showError("No EEG data found in IndexedDB.");
    return;
  }
}

function updateUIAfterFileLoad(channelNames, totalDurationSec) {
  document.getElementById(
    "fileLabel"
  ).textContent = `File: ${currentFileName} (${totalDurationSec.toFixed(0)}s)`;
  populateChannelList(channelNames);
  setTimeout(() => {
    initEEGTimeSlider();
  }, 100);
  document.getElementById("toggleViewBtn").textContent =
    "Switch to Compact View";
  plotCurrentWindow();
}

function parseTxtEEG(text) {
  // 1. Scan header for possible sampling rate
  const lines = text.trim().split(/\r?\n/);
  let sampleRate = 256;
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    if (/sampling[ _]?rate/i.test(lines[i])) {
      const m = lines[i].match(/\d+/);
      if (m) sampleRate = parseInt(m[0]);
    }
  }

  // 2. Auto-detect delimiter
  const delims = [",", "\t", ";", "|"];
  const header = lines[0];
  let delimiter = ",";
  let maxCols = 0;
  delims.forEach(d => {
    const cols = header.split(d).length;
    if (cols > maxCols) {
      maxCols = cols;
      delimiter = d;
    }
  });

  // 3. Column names and select real EEG channels by keyword
  const headers = header.split(delimiter).map(h => h.trim());
  const validKeywords = [
    "eeg", "exg", "channel", "fp", "fz", "cz", "pz", "oz",
    "t3", "t4", "t5", "t6", "accel"
  ];
  // Remove Timestamp/Sample columns
  const ignoreKeywords = ["timestamp", "sample", "time", "index"];

  // Find EEG channels by keyword; skip ignored columns
  const channelIndexes = headers
    .map((h, idx) =>
      ignoreKeywords.some(kw => h.toLowerCase().includes(kw))
        ? null
        : (
            validKeywords.some(kw => h.toLowerCase().includes(kw)) ||
            /^[cfoptz]+[0-9]/i.test(h) // e.g. C3, Fp1, O2
          )
          ? idx
          : null
    )
    .filter(idx => idx !== null);

  // If keyword match fails, fallback to any column that's numeric and not ignored
  let channel_names = channelIndexes.map(idx => headers[idx]);
  if (!channel_names.length) {
    channel_names = headers.filter(
      (h, idx) => !ignoreKeywords.some(kw => h.toLowerCase().includes(kw))
    );
    // Use all columns except ignored if nothing matched
    channelIndexes.length = 0;
    headers.forEach((h, idx) => {
      if (!ignoreKeywords.some(kw => h.toLowerCase().includes(kw)))
        channelIndexes.push(idx);
    });
  }

  // 4. Parse data table
  const dataRows = lines
    .slice(1)
    .map(line =>
      line
        .split(delimiter)
        .filter((_, idx) => channelIndexes.includes(idx))
        .map(v => {
          const x = parseFloat(v);
          // Treat all blank, NaN, Inf as 0.0 (mimic pd.replace)
          return !isFinite(x) ? 0.0 : x;
        })
    )
    .filter(row => row.length === channel_names.length);

  // 5. Limit to first 10 seconds if possible
  const sampleLimit = Math.min(sampleRate * 10, dataRows.length);
  const limitedRows = dataRows.slice(0, sampleLimit);

  // 6. Signals shape: channels x samples
  const signals = channel_names.map((_, i) => limitedRows.map(row => row[i]));

  return {
    sample_rate: sampleRate,
    channel_names,
    duration: limitedRows.length / sampleRate,
    signals
  };
}

// --- Filtering and PSD in pyodide ---
let pyodide = null;
let pythonReady = false;
async function setupPyodideAndFilters() {
  pyodide = await loadPyodide({ indexURL: "libs/" });
  await pyodide.loadPackage(["numpy", "scipy"]);
  await pyodide.runPythonAsync(`
import numpy as np
from scipy.signal import butter, filtfilt, iirnotch, welch
def apply_filter(signals, fs, filter_type, l_freq, h_freq):
    filtered = []
    for sig in signals:
        if filter_type == 'bandpass':
            b, a = butter(4, [l_freq, h_freq], btype='bandpass', fs=fs)
        elif filter_type == 'highpass':
            b, a = butter(4, l_freq, btype='highpass', fs=fs)
        elif filter_type == 'lowpass':
            b, a = butter(4, h_freq, btype='lowpass', fs=fs)
        elif filter_type == 'notch':
            b, a = iirnotch(l_freq, Q=30, fs=fs)
        else:
            filtered.append(sig)
            continue
        filtered.append(filtfilt(b, a, sig))
    return filtered
def compute_psd(signals, fs):
    freqs_list = []
    psd_list = []
    for sig in signals:
        freqs, psd = welch(sig, fs=fs, nperseg=1024)
        freqs_list.append(freqs)
        psd_list.append(psd)
    return freqs_list, psd_list
    `);
  pythonReady = true;
}
setupPyodideAndFilters();

async function filterInBrowser() {
  const type = document.getElementById("filterType").value;
  if (type === "none") return;
  const l_freq = parseFloat(document.getElementById("lowFreq").value || "0");
  const h_freq = parseFloat(document.getElementById("highFreq").value || "0");
  if (!pythonReady) {
    alert("Python engine not ready yet");
    return;
  }
  try {
    const selectedSignals = eegData.signals;
    pyodide.globals.set("signals", selectedSignals);
    pyodide.globals.set("fs", sampleRate);
    pyodide.globals.set("filter_type", type);
    pyodide.globals.set("l_freq", l_freq);
    pyodide.globals.set("h_freq", h_freq);
    await pyodide.runPythonAsync(`
signals_np = [np.array(sig, dtype=np.float64) for sig in signals]
filtered = apply_filter(signals_np, fs, filter_type, l_freq, h_freq)
        `);
    eegData.signals = pyodide.globals.get("filtered").toJs();
    plotCurrentWindow();
  } catch (err) {
    alert("Filter error: " + err.message);
  }
}

async function computePSDInBrowser(signals, fs) {
  if (!pythonReady) {
    alert("Python engine not ready yet");
    return;
  }
  pyodide.globals.set("signals", signals);
  pyodide.globals.set("fs", fs);
  await pyodide.runPythonAsync(`
freqs_list, psd_list = compute_psd([np.array(sig, dtype=np.float64) for sig in signals], fs)
    `);
  const freqs = pyodide.globals.get("freqs_list").toJs()[0];
  const psd = pyodide.globals.get("psd_list").toJs();
  return { freqs, psd };
}

async function handlePsdToggle() {
  const plotDiv = document.getElementById("plot");
  const psdDiv = document.getElementById("psdPlot");
  const timeline = document.getElementById("timelineContainer");
  const viewToggleBtn = document.getElementById("toggleViewBtn");
  const psdBtn = document.getElementById("showPsdBtn");
  const bottomControls = document.getElementById("bottomControls");
  const fileTitle = document.getElementById("fileTitle");
  const multiTopoBtn = document.getElementById("topomapMultiBtn");
  const mainContainer = document.getElementById("main");

  if (!psdVisible) {
    plotDiv.style.display = "none";
    timeline.style.display = "none";
    bottomControls.style.display = "none";
    viewToggleBtn.style.display = "none";
    if (multiTopoBtn) {
      multiTopoBtn.style.display = "inline-block";
      multiTopoBtn.textContent = "Show Band Topomaps";
    }
    psdDiv.style.display = "block";
    psdBtn.textContent = "Back to EEG";
    
    // Add class for coordinated layout
    mainContainer.classList.add("psd-with-topomaps");
    
    const selectedChannels = getSelectedChannels();
    if (!selectedChannels.length) {
      psdDiv.innerHTML = `<div style="padding: 20px; color: red;">Please select at least one channel.</div>`;
      return;
    }
    await updatePSDPlot(selectedChannels);
    psdVisible = true;
  } else {
    plotDiv.style.display = "block";
    timeline.style.display = "block";
    bottomControls.style.display = "flex";
    viewToggleBtn.style.display = "inline-block";
    psdDiv.style.display = "none";
    psdBtn.textContent = "Show PSD";
    psdVisible = false;
    
    // Remove coordinated layout class
    mainContainer.classList.remove("psd-with-topomaps");
    
    plotCurrentWindow();
    if (multiTopoBtn) {
      multiTopoBtn.style.display = "none";
      multiTopoBtn.textContent = "Show Band Topomaps";
    }
    
    // Hide topomap containers
    const topomapContainer = document.getElementById("topomapContainer");
    if (topomapContainer) topomapContainer.style.display = "none";
    const bandTopo = document.getElementById("multiTopomapContainer");
    if (bandTopo) bandTopo.style.display = "none";
    fileTitle.style.justifyContent = "space-between";
  }
}

async function updatePSDPlot(selectedChannels) {
  const psdDiv = document.getElementById("psdPlot");
  psdDiv.innerHTML = "";
  if (!selectedChannels.length) {
    psdDiv.innerHTML = `<div style="padding: 20px; color: red;">Please select at least one channel to compute PSD.</div>`;
    return;
  }
  try {
    const selectedIndices = selectedChannels.map((ch) =>
      eegData.channel_names.indexOf(ch)
    );
    const selectedSignals = selectedIndices.map((i) => eegData.signals[i]);
    const { freqs, psd } = await computePSDInBrowser(
      selectedSignals,
      sampleRate
    );
    const traces = psd.map((spectrum, i) => ({
      x: freqs,
      y: spectrum,
      type: "scatter",
      mode: "lines",
      name: selectedChannels[i],
    }));

    // Calculate appropriate height based on container constraints
    const isWithTopomaps = document.getElementById("main").classList.contains("psd-with-topomaps");
    const plotHeight = isWithTopomaps ? Math.min(350, window.innerHeight * 0.35) : 400;

    Plotly.newPlot("psdPlot", traces, {
      title: { text: "Power Spectral Density (PSD)", x: 0.5 },
      xaxis: { title: "Frequency (Hz)" },
      yaxis: { title: "Power (dB/Hz)" },
      height: plotHeight,
      margin: { l: 60, r: 40, t: 40, b: 60 },
      showlegend: true,
    }, {responsive: true});
  } catch (err) {
    psdDiv.innerHTML = `<div style="padding: 20px; color: red;">PSD Error: ${err.message}</div>`;
  }
}

function populateChannelList(channelNames) {
  const container = document.getElementById("channelList");
  if (!container) return;
  container.innerHTML = "";

  channelNames.forEach((ch) => {
    const label = document.createElement("label");
    label.style.display = "block";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = ch;
    input.checked = true;
    input.addEventListener("change", () => {
      plotCurrentWindow();
      if (psdVisible) {
        updatePSDPlot(getSelectedChannels());
      }
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(ch));
    container.appendChild(label);
  });
}

function getSelectedChannels() {
  return Array.from(
    document.querySelectorAll("#channelList input:checked")
  ).map((cb) => cb.value);
}

function plotCurrentWindow() {
  const plotDiv = document.getElementById("plot");
  if (!plotDiv || !eegData || !eegData.signals) return;
  plotDiv.innerHTML = "";
  const selectedChannels = getSelectedChannels();
  if (!selectedChannels.length) {
    plotDiv.innerHTML =
      "<div style='padding:20px;color:red;'>No channel selected.</div>";
    return;
  }
  const start = Math.floor(windowStartSec * sampleRate);
  const end = start + windowSize * sampleRate;
  const signals = eegData.signals;
  const channelNames = eegData.channel_names;

  if (isStackedView) {
    const data = [];
    const layout = {
      title: { text: `EEG Signal (Stacked)`, x: 0.5 },
      grid: {
        rows: selectedChannels.length,
        columns: 1,
        pattern: "independent",
      },
      height: Math.max(selectedChannels.length * 100, 500),
      margin: { l: 60, r: 20, t: 40, b: 40 },
      showlegend: false,
    };
    selectedChannels.forEach((ch, idx) => {
      const chIdx = channelNames.indexOf(ch);
      const signal = signals[chIdx].slice(start, end);
      const time = Array.from(
        { length: signal.length },
        (_, i) => (start + i) / sampleRate
      );
      data.push({
        x: time,
        y: signal,
        type: "scatter",
        mode: "lines",
        name: ch,
        xaxis: `x${idx + 1}`,
        yaxis: `y${idx + 1}`,
        line: { width: 1 },
        hoverlabel: { bgcolor: "#eee", font: { size: 11 } },
        hovertemplate: `**${ch}**<br>Time: %{x:.2f}s<br>Value: %{y:.2f}<extra></extra>`,
      });
    });
    Plotly.newPlot("plot", data, layout, {responsive: true});
  } else {
    // Compact/superimposed
    const data = [];
    selectedChannels.forEach((ch) => {
      const chIdx = channelNames.indexOf(ch);
      const signal = signals[chIdx].slice(start, end);
      const time = Array.from(
        { length: signal.length },
        (_, i) => (start + i) / sampleRate
      );
      data.push({
        x: time,
        y: signal,
        type: "scatter",
        mode: "lines",
        name: ch,
        line: { width: 1 },
      });
    });
    Plotly.newPlot("plot", data, {
      title: { text: "EEG Signal (Compact)", x: 0.5 },
      xaxis: { title: "Time (s)" },
      yaxis: { title: "Amplitude (µV)" },
      height: 500,
      margin: { l: 60, r: 20, t: 40, b: 60 },
      showlegend: true,
    }, {responsive: true});
  }
}

// Slider functions
function initEEGTimeSlider() {
  timeSliderCanvas = document.getElementById("eegTimeSlider");
  if (!timeSliderCanvas) {
    console.error("Timeline canvas not found!");
    return;
  }
  sliderCtx = timeSliderCanvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  timeSliderCanvas.width = timeSliderCanvas.offsetWidth * dpr;
  timeSliderCanvas.height = 30 * dpr;
  sliderCtx.setTransform(1, 0, 0, 1, 0, 0);
  sliderCtx.scale(dpr, dpr);
  drawSlider();
  timeSliderCanvas.addEventListener("mousedown", onSliderMouseDown);
  window.addEventListener("mouseup", () => (dragging = false));
  window.addEventListener("mousemove", onSliderMouseMove);
  document.addEventListener("keydown", handleKeyNavigation);
  
  // Enhanced resize handler
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      handleResize();
    }, 100);
  });
}

function handleResize() {
  // Handle timeline resize
  if (timeSliderCanvas && sliderCtx) {
    const dpr = window.devicePixelRatio || 1;
    timeSliderCanvas.width = timeSliderCanvas.offsetWidth * dpr;
    timeSliderCanvas.height = 30 * dpr;
    sliderCtx.setTransform(1, 0, 0, 1, 0, 0);
    sliderCtx.scale(dpr, dpr);
    drawSlider();
  }
  
  // Force Plotly resize for main plots
  setTimeout(() => {
    const plotDiv = document.getElementById("plot");
    const psdDiv = document.getElementById("psdPlot");
    
    if (plotDiv && plotDiv.style.display !== "none") {
      Plotly.Plots.resize("plot");
    }
    
    if (psdDiv && psdDiv.style.display !== "none") {
      // Update PSD plot height based on current layout
      const isWithTopomaps = document.getElementById("main").classList.contains("psd-with-topomaps");
      const newHeight = isWithTopomaps ? Math.min(350, window.innerHeight * 0.35) : 400;
      
      Plotly.relayout("psdPlot", {
        height: newHeight
      });
    }
    
    // Resize topomap plots if visible
    const multiTopomapContainer = document.getElementById("multiTopomapContainer");
    if (multiTopomapContainer && multiTopomapContainer.style.display !== "none") {
      const topomapPlots = multiTopomapContainer.querySelectorAll('.topomap-plot');
      topomapPlots.forEach(plot => {
        if (plot.id) {
          Plotly.Plots.resize(plot.id);
        }
      });
    }
  }, 150);
}

function drawSlider() {
  if (!timeSliderCanvas || !sliderCtx) return;
  const width = timeSliderCanvas.offsetWidth;
  const height = 30;
  sliderCtx.clearRect(0, 0, width, height);
  sliderCtx.fillStyle = "#ffffff";
  sliderCtx.fillRect(0, 0, width, height);
  sliderCtx.strokeStyle = "#ddd";
  sliderCtx.strokeRect(0, 0, width, height);
  if (totalDurationSec <= 0) return;
  const timeSpan = totalDurationSec;
  const cursorX = (windowStartSec / timeSpan) * width;
  sliderCtx.beginPath();
  sliderCtx.strokeStyle = "#888";
  sliderCtx.lineWidth = 4;
  sliderCtx.moveTo(cursorX, 0);
  sliderCtx.lineTo(cursorX, height);
  sliderCtx.stroke();
  sliderCtx.lineWidth = 1;
  sliderCtx.fillStyle = "#333";
  sliderCtx.font = "10px Arial";
  sliderCtx.textAlign = "center";
  sliderCtx.fillText(formatTime(windowStartSec), cursorX, 10);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function onSliderMouseDown(e) {
  dragging = true;
  onSliderMouseMove(e);
}

function onSliderMouseMove(e) {
  if (!dragging) return;
  const rect = timeSliderCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const percent = Math.max(0, Math.min(1, x / rect.width));
  const maxStart = Math.max(0, totalDurationSec - windowSize);
  const newWindowStart = percent * maxStart;
  windowStartSec = Math.max(
    0,
    Math.min(maxStart, Math.round(newWindowStart * 10) / 10)
  );
  drawSlider();
  plotCurrentWindow();
}

function handleKeyNavigation(e) {
  if (!eegData) return;
  let moved = false;
  const step = 1;
  switch (e.key) {
    case "ArrowLeft":
      e.preventDefault();
      windowStartSec = Math.max(0, windowStartSec - step);
      moved = true;
      break;
    case "ArrowRight":
      e.preventDefault();
      windowStartSec = Math.min(maxWindow, windowStartSec + step);
      moved = true;
      break;
    case "PageUp":
      e.preventDefault();
      windowStartSec = Math.max(0, windowStartSec - windowSize);
      moved = true;
      break;
    case "PageDown":
      e.preventDefault();
      windowStartSec = Math.min(maxWindow, windowStartSec + windowSize);
      moved = true;
      break;
    case "Home":
      e.preventDefault();
      windowStartSec = 0;
      moved = true;
      break;
    case "End":
      e.preventDefault();
      windowStartSec = maxWindow;
      moved = true;
      break;
  }
  if (moved) {
    drawSlider();
    plotCurrentWindow();
  }
}

// Clean channel name function
function cleanChannelName(chName) {
    let ch = String(chName).toUpperCase();
    ch = ch.replace(/EEG\s*/g, "").replace(/REF/g, "").replace(/\./g, "").replace(/\s/g, "").replace(/-/g, "");
    ch = ch.replace(/_/g, "").replace(/CH/g, "").replace(/CHANNEL/g, "");
    return ch;
}

// Map channels to standard electrode positions
function mapChannelsToElectrodes(channelNames) {
    const channelMapping = {};
    const usedNames = new Set();
    
    for (const ch of channelNames) {
        const cleanCh = cleanChannelName(ch);
        let bestMatch = null;
        
        // Direct match
        if (cleanCh in ELECTRODE_POSITIONS && !usedNames.has(cleanCh)) {
            bestMatch = cleanCh;
        } else {
            // Handle differential montage (take first electrode)
            if (ch.includes('-')) {
                const firstPart = cleanChannelName(ch.split('-')[0]);
                if (firstPart in ELECTRODE_POSITIONS && !usedNames.has(firstPart)) {
                    bestMatch = firstPart;
                }
            }
            
            // Fuzzy matching
            if (!bestMatch) {
                for (const standardName of Object.keys(ELECTRODE_POSITIONS)) {
                    if (!usedNames.has(standardName)) {
                        if (cleanCh.includes(standardName) || standardName.includes(cleanCh) ||
                            cleanCh.replace('Z', '') === standardName.replace('Z', '')) {
                            bestMatch = standardName;
                            break;
                        }
                    }
                }
            }
        }
        
        if (bestMatch) {
            channelMapping[ch] = bestMatch;
            usedNames.add(bestMatch);
        }
    }
    
    return channelMapping;
}

// Interpolate values for topomap using inverse distance weighting
function interpolateTopomap(electrodePositions, values, gridSize = 67) {
    const xMin = -0.12, xMax = 0.12, yMin = -0.12, yMax = 0.12;
    const xStep = (xMax - xMin) / (gridSize - 1);
    const yStep = (yMax - yMin) / (gridSize - 1);
    
    const x = [], y = [], z = [];
    const headRadius = 0.095;
    
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const xi = xMin + i * xStep;
            const yi = yMin + j * yStep;
            
            // Check if point is within head circle
            const radius = Math.sqrt(xi * xi + yi * yi);
            if (radius <= headRadius) {
                let weightedSum = 0;
                let weightSum = 0;
                
                for (let k = 0; k < electrodePositions.length; k++) {
                    const [ex, ey] = electrodePositions[k];
                    const distance = Math.sqrt((xi - ex) ** 2 + (yi - ey) ** 2);
                    
                    if (distance < 1e-6) {
                        weightedSum = values[k];
                        weightSum = 1;
                        break;
                    } else {
                        const weight = 1 / Math.pow(distance, 2.5);
                        weightedSum += weight * values[k];
                        weightSum += weight;
                    }
                }
                
                x.push(xi);
                y.push(yi);
                z.push(weightSum > 0 ? weightedSum / weightSum : 0);
            }
        }
    }
    
    return { x, y, z };
}

// Create head outline
function createHeadOutline() {
    const numPoints = 100;
    const headRadius = 0.095;
    
    // Main head circle
    const headX = [], headY = [];
    for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * 2 * Math.PI;
        headX.push(headRadius * Math.cos(angle));
        headY.push(headRadius * Math.sin(angle));
    }
    
    // Nose (triangle pointing up)
    const noseX = [0, -0.012, 0.012, 0];
    const noseY = [headRadius, headRadius + 0.018, headRadius + 0.018, headRadius];
    
    // Left ear
    const leftEarX = [-headRadius, -headRadius - 0.008, -headRadius - 0.008, -headRadius];
    const leftEarY = [0.025, 0.035, -0.035, -0.025];
    
    // Right ear
    const rightEarX = [headRadius, headRadius + 0.008, headRadius + 0.008, headRadius];
    const rightEarY = [0.025, 0.035, -0.035, -0.025];
    
    return {
        head: { x: headX, y: headY },
        nose: { x: noseX, y: noseY },
        leftEar: { x: leftEarX, y: leftEarY },
        rightEar: { x: rightEarX, y: rightEarY }
    };
}

// Enhanced responsive topomap generation
async function generateBandTopomaps() {
    if (!pythonReady) {
        alert("Python engine not ready yet");
        return;
    }
    
    const selectedChannels = getSelectedChannels();
    if (selectedChannels.length < 3) {
        alert("Need at least 3 channels for topomap");
        return;
    }
    
    const channelMapping = mapChannelsToElectrodes(selectedChannels);
    const mappedChannels = Object.keys(channelMapping);
    
    if (mappedChannels.length < 3) {
        alert(`Only ${mappedChannels.length} channels could be mapped to electrode positions. Need at least 3.`);
        return;
    }
    
    try {
        const selectedIndices = mappedChannels.map(ch => eegData.channel_names.indexOf(ch));
        const selectedSignals = selectedIndices.map(i => eegData.signals[i]);
        const { freqs, psd } = await computePSDInBrowser(selectedSignals, sampleRate);
        
        const multiTopomapContainer = document.getElementById("multiTopomapContainer");
        multiTopomapContainer.innerHTML = "";
        multiTopomapContainer.style.display = "block";
        
        // Create responsive container using CSS classes
        const topomapsWrapper = document.createElement("div");
        topomapsWrapper.className = "topomaps-wrapper";
        multiTopomapContainer.appendChild(topomapsWrapper);
        
        for (const [bandName, [lowFreq, highFreq]] of Object.entries(FREQUENCY_BANDS)) {
            // Calculate average power in frequency range
            const freqMask = freqs.map(f => f >= lowFreq && f <= highFreq);
            const bandPower = psd.map(spectrum => {
                const bandValues = spectrum.filter((_, i) => freqMask[i]);
                return bandValues.reduce((a, b) => a + b, 0) / bandValues.length;
            });
            
            // Get electrode positions
            const electrodePositions = [];
            for (let i = 0; i < mappedChannels.length; i++) {
                const standardName = channelMapping[mappedChannels[i]];
                const [x, y, z] = ELECTRODE_POSITIONS[standardName];
                electrodePositions.push([x, y]);
            }
            
            // Create individual topomap container using CSS classes
            const bandContainer = document.createElement("div");
            bandContainer.className = "band-container";
            
            const plotDiv = document.createElement("div");
            plotDiv.id = `topomap_${bandName.split(' ')[0]}`;
            plotDiv.className = "topomap-plot";
            bandContainer.appendChild(plotDiv);
            
            topomapsWrapper.appendChild(bandContainer);
            
            // Generate topomap for this frequency range
            const interpolated = interpolateTopomap(electrodePositions, bandPower, 50);
            const headOutline = createHeadOutline();
            
            const xRange = Array.from(new Set(interpolated.x)).sort((a, b) => a - b);
            const yRange = Array.from(new Set(interpolated.y)).sort((a, b) => a - b);
            
            const zGrid = [];
            for (let i = 0; i < yRange.length; i++) {
                const row = [];
                for (let j = 0; j < xRange.length; j++) {
                    const idx = interpolated.x.findIndex((x, k) => 
                        Math.abs(x - xRange[j]) < 1e-6 && Math.abs(interpolated.y[k] - yRange[i]) < 1e-6);
                    row.push(idx >= 0 ? interpolated.z[idx] : null);
                }
                zGrid.push(row);
            }
            
            const traces = [
                {
                    type: 'contour',
                    x: xRange,
                    y: yRange,
                    z: zGrid,
                    colorscale: 'RdBu',
                    reversescale: true,
                    showscale: false,
                    contours: {
                        coloring: 'fill',
                        showlines: true,
                        line: { color: 'rgba(0,0,0,0.1)', width: 0.5 }
                    },
                    hoverinfo: 'skip'
                },
                // Head outline
                {
                    type: 'scatter',
                    x: headOutline.head.x,
                    y: headOutline.head.y,
                    mode: 'lines',
                    line: { color: 'black', width: 2.5 },
                    showlegend: false,
                    hoverinfo: 'skip'
                },
                // Nose
                {
                    type: 'scatter',
                    x: headOutline.nose.x,
                    y: headOutline.nose.y,
                    mode: 'lines',
                    line: { color: 'black', width: 2.5 },
                    fill: 'toself',
                    fillcolor: 'black',
                    showlegend: false,
                    hoverinfo: 'skip'
                },
                // Ears
                {
                    type: 'scatter',
                    x: headOutline.leftEar.x,
                    y: headOutline.leftEar.y,
                    mode: 'lines',
                    line: { color: 'black', width: 2.5 },
                    showlegend: false,
                    hoverinfo: 'skip'
                },
                {
                    type: 'scatter',
                    x: headOutline.rightEar.x,
                    y: headOutline.rightEar.y,
                    mode: 'lines',
                    line: { color: 'black', width: 2.5 },
                    showlegend: false,
                    hoverinfo: 'skip'
                }
            ];
            
            const layout = {
                title: {
                    text: bandName,
                    font: { size: 14 }
                },
                xaxis: { 
                    visible: false, 
                    range: [-0.12, 0.12],
                    scaleanchor: 'y',
                    scaleratio: 1,
                    fixedrange: true
                },
                yaxis: { 
                    visible: false, 
                    range: [-0.12, 0.12],
                    fixedrange: true
                },
                showlegend: false,
                margin: { l: 10, r: 10, t: 30, b: 10 },
                plot_bgcolor: 'white',
                paper_bgcolor: 'white'
            };
            
            // Create plot and handle responsiveness
            await Plotly.newPlot(plotDiv.id, traces, layout, {
                displayModeBar: false, 
                responsive: true,
                staticPlot: false
            });
            
            // Add resize observer for individual topomap
            if (window.ResizeObserver) {
                const resizeObserver = new ResizeObserver(() => {
                    Plotly.Plots.resize(plotDiv.id);
                });
                resizeObserver.observe(plotDiv);
            }
        }
        
    } catch (error) {
        alert(`Topomaps generation failed: ${error.message}`);
    }
}

// Main topomap function
function showBandTopomaps() {
    const multiTopomapContainer = document.getElementById("multiTopomapContainer");
    const mainContainer = document.getElementById("main");
    const topomapBtn = document.getElementById("topomapMultiBtn");
    
    // If topomaps are already visible, hide them
    if (multiTopomapContainer.style.display === "block") {
        multiTopomapContainer.style.display = "none";
        mainContainer.classList.remove("psd-with-topomaps");
        if (topomapBtn) topomapBtn.textContent = "Show Band Topomaps";
        return;
    }
    
    // Add coordinated layout class if in PSD mode
    if (psdVisible) {
        mainContainer.classList.add("psd-with-topomaps");
    }
    
    if (topomapBtn) topomapBtn.textContent = "Hide Topomaps";
    generateBandTopomaps();
}

function showError(message) {
  const errorDiv = document.getElementById("error");
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = "block";
  } else {
    console.error("Error:", message);
  }
}