// Full viewer.js updated with side-by-side raw signal and PSD
let eegData = null;
let sampleRate = 256;
let windowSize = 10;
let maxWindow = 0;
let currentFileName = "Unknown File";

console.log("🔧 EEG Viewer starting...");

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initializeViewer();
  } catch (error) {
    showError(`Initialization failed: ${error.message}`);
  }
});

async function initializeViewer() {
  if (typeof Plotly === "undefined") throw new Error("Plotly.js not loaded");

  const eegStore = new EEGStorage();
  const edfData = await eegStore.getEDFFile();

  if (edfData?.data) {
    currentFileName = edfData.filename || "Unknown File";
    await sendToFlaskAndLoadSignals(edfData.data);
    return;
  }

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
      await sendTextToFlaskAndLoadSignals(textResult.data);
    } else {
      showError("No EEG data found in IndexedDB");
    }
  } catch (e) {
    showError("No EEG data found in IndexedDB");
  }
}

async function sendToFlaskAndLoadSignals(bufferArray) {
  try {
    const blob = new Blob([new Uint8Array(bufferArray)], { type: "application/octet-stream" });
    const formData = new FormData();
    formData.append("file", blob, currentFileName);

    const response = await fetch("http://localhost:5000/edf-preview", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error(await response.text());

    const result = await response.json();
    initializeData(result);
  } catch (error) {
    showError(error.message);
  }
}

async function sendTextToFlaskAndLoadSignals(text) {
  try {
    const blob = new Blob([text], { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", blob, currentFileName);

    const response = await fetch("http://localhost:5000/txt-preview", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error(await response.text());

    const result = await response.json();
    initializeData(result);
  } catch (error) {
    showError(error.message);
  }
}

function initializeData(result) {
  eegData = result;
  sampleRate = result.sample_rate;
  maxWindow = Math.max(0, Math.floor(result.signals[0].length / sampleRate) - windowSize);
  document.getElementById("fileTitle").textContent = `File: ${currentFileName}`;
  populateChannelDropdown(result.channel_names);
  configureSlider();
  plotCurrentWindow();

  document.getElementById("applyFilter").addEventListener("click", async () => {
    const type = document.getElementById("filterType").value;
    if (type === "none") return;

    const l_freq = parseFloat(document.getElementById("lowFreq").value || "0");
    const h_freq = parseFloat(document.getElementById("highFreq").value || "0");

    try {
      const res = await fetch("http://localhost:5000/filter-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signals: eegData.signals,
          sample_rate: sampleRate,
          filter_type: type,
          l_freq: isNaN(l_freq) ? null : l_freq,
          h_freq: isNaN(h_freq) ? null : h_freq,
        }),
      });

      const result = await res.json();
      if (result.error) throw new Error(result.error);

      eegData.signals = result.filtered;
      plotCurrentWindow();
      alert("✅ Filter applied!");
    } catch (err) {
      alert("Error applying filter: " + err.message);
    }
  });

  document.getElementById("psdButton").addEventListener("click", async () => {
    try {
      const selected = Array.from(
        document.querySelectorAll("#channelCheckboxes input:checked")
      ).map((cb) => cb.value);

      const selectedIndices = selected.map((ch) => eegData.channel_names.indexOf(ch));
      const selectedSignals = selectedIndices.map((i) => eegData.signals[i]);

      const res = await fetch("http://localhost:5000/psd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signals: selectedSignals, sample_rate: sampleRate }),
      });

      const result = await res.json();
      if (result.error) throw new Error(result.error);

      plotPSD(result.freqs, result.psd, selected);
    } catch (err) {
      alert("PSD Error: " + err.message);
    }
  });
}

function populateChannelDropdown(channelNames) {
  const container = document.getElementById("channelCheckboxes");
  if (!container) return;
  container.innerHTML = "";

  channelNames.forEach((ch, i) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = ch;
    input.checked = i < 3;
    input.addEventListener("change", plotCurrentWindow);

    label.appendChild(input);
    label.appendChild(document.createTextNode(ch));
    container.appendChild(label);
  });

  const dropdownBtn = document.querySelector(".dropdown-btn");
  dropdownBtn.onclick = () => {
    container.style.display =
      container.style.display === "block" ? "none" : "block";
  };
}

function configureSlider() {
  const slider = document.getElementById("windowSlider");
  const label = document.getElementById("windowTimeLabel");

  slider.max = maxWindow;
  slider.value = 0;
  slider.disabled = false;
  label.textContent = `0s–${windowSize}s`;

  slider.addEventListener("input", () => {
    const startSec = parseInt(slider.value);
    label.textContent = `${startSec}s–${startSec + windowSize}s`;
    plotCurrentWindow();
  });
}

function plotCurrentWindow() {
  const slider = document.getElementById("windowSlider");
  const selectedChannels = Array.from(
    document.querySelectorAll("#channelCheckboxes input:checked")
  ).map((cb) => cb.value);

  const start = parseInt(slider.value) * sampleRate;
  const end = start + windowSize * sampleRate;
  const traces = selectedChannels.map((ch) => {
    const chIdx = eegData.channel_names.indexOf(ch);
    const signal = eegData.signals[chIdx].slice(start, end);
    const time = Array.from({ length: signal.length }, (_, i) => (start + i) / sampleRate);
    return { x: time, y: signal, type: "scatter", mode: "lines", name: ch };
  });

  const layout = {
    title: { text: `EEG Signal`, x: 0.5 },
    xaxis: { title: "Time (s)" },
    yaxis: { title: "Amplitude (µV)" },
    height: window.innerHeight / 2.2,
    margin: { l: 60, r: 40, t: 40, b: 60 },
    showlegend: true,
  };

  Plotly.newPlot("plot", traces, layout, { responsive: true });
}

function plotPSD(freqs, psd, channelNames) {
  const traces = psd.map((spectrum, i) => ({
    x: freqs,
    y: spectrum,
    type: "scatter",
    mode: "lines",
    name: channelNames[i],
  }));

  const layout = {
    title: { text: `Power Spectral Density`, x: 0.5 },
    xaxis: { title: "Frequency (Hz)" },
    yaxis: { title: "Power (dB)" },
    height: window.innerHeight / 2.2,
    margin: { l: 60, r: 40, t: 40, b: 60 },
    showlegend: true,
  };

  Plotly.newPlot("plot2", traces, layout, { responsive: true });
}

function showError(message) {
  const plotDiv = document.getElementById("plot");
  plotDiv.innerHTML = `
    <div class="error-container">
      <div class="error-message">${message}</div>
      <div class="troubleshooting">
        - Check browser console (F12) for detailed logs<br>
        - Ensure Flask API is running at http://localhost:5000<br>
        - Make sure CORS is enabled in Flask
      </div>
      <div class="action-buttons">
        <button onclick="window.location.reload()" class="btn btn-primary">Reload Page</button>
      </div>
    </div>
  `;
}

// Loading placeholder
const plotDiv = document.getElementById("plot");
if (plotDiv) {
  plotDiv.innerHTML = `<div class="loading">🧠 Loading EEG data...</div>`;
}
