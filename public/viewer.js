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
    const multiTopoBtn = document.getElementById("topomapMultiBtn");
    if (multiTopoBtn) {
      multiTopoBtn.disabled = true;
      multiTopoBtn.title = "Topomap only in server mode";
    }
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
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("Not enough data lines");
  let delimiter = ",";
  if (lines[0].split("\t").length > lines[0].split(",").length)
    delimiter = "\t";
  const headers = lines[0].split(delimiter).map((h) => h.trim());
  const numChannels = headers.length;
  const dataRows = lines
    .slice(1)
    .map((l) => l.split(delimiter).map(Number))
    .filter((row) => row.length === numChannels && row.every((v) => !isNaN(v)));
  let sampleRate_local = 256;
  for (const l of lines) {
    if (/sampling[\s_]?rate/i.test(l)) {
      const m = l.match(/\d+/);
      if (m) sampleRate_local = parseInt(m[0]);
    }
  }
  let channel_names = headers.every((h) => isNaN(Number(h)))
    ? headers
    : headers.map((_, i) => `Ch${i + 1}`);
  const signals = channel_names.map((_, i) => dataRows.map((row) => row[i]));
  return {
    channel_names,
    sample_rate: sampleRate_local,
    signals,
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

  if (!psdVisible) {
    plotDiv.style.display = "none";
    timeline.style.display = "none";
    bottomControls.style.display = "none";
    viewToggleBtn.style.display = "none";
    if (multiTopoBtn) multiTopoBtn.style.display = "inline-block";
    psdDiv.style.display = "block";
    psdBtn.textContent = "Back to EEG";
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
    plotCurrentWindow();
    if (multiTopoBtn) multiTopoBtn.style.display = "none";
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

    Plotly.newPlot("psdPlot", traces, {
      title: { text: "Power Spectral Density (PSD)", x: 0.5 },
      xaxis: { title: "Frequency (Hz)" },
      yaxis: { title: "Power (dB/Hz)" },
      height: 400,
      margin: { l: 60, r: 40, t: 40, b: 60 },
      showlegend: true,
    });
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
    Plotly.newPlot("plot", data, layout);
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
    });
  }
}

// Slider

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
  window.addEventListener("resize", () => {
    setTimeout(() => {
      timeSliderCanvas.width = timeSliderCanvas.offsetWidth * dpr;
      timeSliderCanvas.height = 30 * dpr;
      sliderCtx.setTransform(1, 0, 0, 1, 0, 0);
      sliderCtx.scale(dpr, dpr);
      drawSlider();
    }, 100);
  });
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

function fetchTopomap() {
  alert("Topomap is only available in the server version.");
}
function showBandTopomaps() {
  alert("Topomap is only available in the server version.");
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
