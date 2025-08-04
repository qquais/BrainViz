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

// Patch for some versions/naming
if (window.edfdecoder && window.edfdecoder.EDFDecoder) {
  window.EDFDecoder = window.edfdecoder.EDFDecoder;
}

// Pyodide setup for filtering and PSD
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
});

async function initializeViewer() {
  if (typeof Plotly === "undefined") throw new Error("Plotly.js not loaded");
  const eegStore = new EEGStorage();

  // Try EDF first
  const edfData = await eegStore.getEDFFile();
  if (edfData?.data) {
    try {
      currentFileName = edfData.filename || "Unknown File";
      const buffer =
        edfData.data instanceof ArrayBuffer
          ? edfData.data
          : new Uint8Array(edfData.data).buffer;
      const decoder = new window.edfdecoder.EdfDecoder();
      decoder.setInput(buffer);
      decoder.decode();
      const edfObject = decoder.getOutput();

      // Use physical samples if at all possible
      let signals;
      if (typeof decoder.getPhysicalSamples === "function") {
        signals = decoder.getPhysicalSamples();
      } else if (edfObject._physicalSignals) {
        signals = edfObject._physicalSignals;
      } else if (edfObject.physicalSignals) {
        signals = edfObject.physicalSignals;
      } else if (typeof decoder.getDigitalSamples === "function") {
        signals = decoder.getDigitalSamples();
        alert("WARNING: Showing digital values, not physical units!");
      } else {
        signals = edfObject._rawSignals;
        alert("WARNING: Showing digital values, not physical units!");
      }

      const numChannels = Array.isArray(signals) ? signals.length : 0;
      const numSamples = (numChannels > 0 && Array.isArray(signals[0])) ? signals[0].length : 0;

      // Get sample rate
      let sampleRate_local = null;
      for (const key in edfObject.header) {
        if (
          key &&
          typeof edfObject.header[key] === "number" &&
          (key.toLowerCase().includes("samplerate") ||
            key.toLowerCase().includes("sample_rate") ||
            key.toLowerCase().includes("samplingrate") ||
            key.toLowerCase().includes("fs") ||
            key.toLowerCase().includes("frequency"))
        ) {
          sampleRate_local = Number(edfObject.header[key]);
          break;
        }
      }
      if (!sampleRate_local && edfObject.header?.sample_frequency)
        sampleRate_local = Number(edfObject.header.sample_frequency);
      if (!sampleRate_local) {
        sampleRate_local = Number(
          prompt(
            "Sample rate not found in this EDF file. Please enter the sample rate (Hz) for your data.",
            "256"
          )
        );
        if (isNaN(sampleRate_local) || sampleRate_local <= 0) {
          showError("Valid sample rate required to load EDF data.");
          return;
        }
      }
      totalDurationSec = Math.floor(numSamples / sampleRate_local);

      // --- NEW: Robust channel name extraction ---
      let channelNames = [];
      if (typeof decoder.getSignalLabels === "function") {
        const slabels = decoder.getSignalLabels();
        if (slabels && Array.isArray(slabels) && slabels.length === numChannels) {
          channelNames = slabels.map(v => String(v).trim());
          console.log("USING decoder.getSignalLabels()");
        }
      }
      if (channelNames.length !== numChannels && edfObject.header?.label && Array.isArray(edfObject.header.label) && edfObject.header.label.length === numChannels) {
        channelNames = edfObject.header.label.map(v => String(v).trim());
        console.log("USING edfObject.header.label (array)");
      }
      if (channelNames.length !== numChannels && typeof edfObject.header?.label === "string") {
        let temp = edfObject.header.label.trim().split(/\s*[,;]\s*|\s+/);
        if (temp.length === numChannels) {
          channelNames = temp.map(v => v.trim());
          console.log("USING edfObject.header.label (string split)");
        }
      }
      if (
        channelNames.length !== numChannels &&
        typeof edfObject.header?.label === "string" &&
        edfObject.header.label.length === (16 * numChannels)
      ) {
        let temp = [];
        for (let i = 0; i < numChannels; i++) {
          temp.push(edfObject.header.label.substr(i*16, 16).trim());
        }
        channelNames = temp;
        console.log("USING fixed-width split from header.label string");
      }
      if (channelNames.length !== numChannels && edfObject.header?.channels && Array.isArray(edfObject.header.channels) && edfObject.header.channels.length === numChannels) {
        channelNames = edfObject.header.channels.map(v => String(v).trim());
        console.log("USING edfObject.header.channels (array)");
      }
      if (channelNames.length !== numChannels) {
        channelNames = Array.from({ length: numChannels }, (_, i) => `Ch${i + 1}`);
        console.log("USING fallback generic names");
      }
      console.log("Final channelNames", channelNames);

      // Debugging info
      console.log(
        "Physical signals (first channel) range: ",
        Math.min(...signals[0]), Math.max(...signals[0])
      );

      eegData = {
        channel_names: channelNames,
        sample_rate: sampleRate_local,
        signals: signals,
      };
      sampleRate = sampleRate_local;
      windowSize = 10;
      maxWindow = Math.max(0, totalDurationSec - windowSize);
      windowStartSec = 0;

      updateUIAfterFileLoad(channelNames, totalDurationSec);

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
    } catch (e) {
      showError("Failed to parse EDF in browser: " + e.message);
      return;
    }
  }

  // Try TXT next
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
    if (textResult?.data) {
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
      showError("No EEG data found in IndexedDB");
    }
  } catch (e) {
    showError("No EEG data found in IndexedDB");
  }
}

function updateUIAfterFileLoad(channelNames, totalDurationSec) {
  document.getElementById("fileLabel").textContent = `File: ${currentFileName} (${totalDurationSec.toFixed(0)}s)`;
  populateChannelList(channelNames);
  setTimeout(() => {
    initEEGTimeSlider();
  }, 100);
  document.getElementById("toggleViewBtn").textContent = "Switch to Compact View";
  plotCurrentWindow();
}

function parseTxtEEG(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("Not enough data lines");
  let delimiter = ",";
  if (lines[0].split("\t").length > lines[0].split(",").length) delimiter = "\t";
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
    psdDiv.innerHTML =
      `<div style="padding: 20px; color: red;">Please select at least one channel to compute PSD.</div>`;
    return;
  }
  try {
    const selectedIndices = selectedChannels.map((ch) =>
      eegData.channel_names.indexOf(ch)
    );
    const selectedSignals = selectedIndices.map((i) => eegData.signals[i]);
    const { freqs, psd } = await computePSDInBrowser(selectedSignals, sampleRate);
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

  // Add select/unselect all buttons
  const selectAllBtn = document.createElement("button");
  selectAllBtn.textContent = "Select All";
  selectAllBtn.onclick = () => {
    container.querySelectorAll("input[type=checkbox]").forEach(cb => cb.checked = true);
    plotCurrentWindow();
    if (psdVisible) {
      const selected = getSelectedChannels();
      updatePSDPlot(selected);
    }
  };
  const unselectAllBtn = document.createElement("button");
  unselectAllBtn.textContent = "Unselect All";
  unselectAllBtn.onclick = () => {
    container.querySelectorAll("input[type=checkbox]").forEach(cb => cb.checked = false);
    plotCurrentWindow();
    if (psdVisible) {
      const selected = getSelectedChannels();
      updatePSDPlot(selected);
    }
  };
  container.appendChild(selectAllBtn);
  container.appendChild(unselectAllBtn);

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
        const selected = getSelectedChannels();
        updatePSDPlot(selected);
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
    plotDiv.innerHTML = "<div style='padding:20px;color:red;'>No channel selected.</div>";
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
      grid: { rows: selectedChannels.length, columns: 1, pattern: "independent" },
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

// Slider etc. code below unchanged from previous messages

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
  sliderCtx.setTransform(1, 0, 0, 1, 0, 0); // Reset any previous transform
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
