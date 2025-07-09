let eegData = null;
let sampleRate = 256;
let windowSize = 10;
let maxWindow = 0;

console.log("🔧 EEG Viewer starting...");

document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 DOM loaded, initializing viewer...");

  window.addEventListener("error", (e) => {
    console.error("💥 Global error caught:", e.error);
    showError(`JavaScript Error: ${e.error.message}`);
    e.preventDefault();
    return true;
  });

  window.addEventListener("unhandledrejection", (e) => {
    console.error("💥 Unhandled promise rejection:", e.reason);
    showError(`Promise Error: ${e.reason}`);
    e.preventDefault();
    return true;
  });

  try {
    await initializeViewer();
  } catch (error) {
    console.error("💥 Initialization failed:", error);
    showError(`Initialization failed: ${error.message}`);
  }
});

async function initializeViewer() {
  console.log("🔧 Initializing viewer...");

  if (typeof Plotly === "undefined") {
    throw new Error("Plotly.js library not loaded");
  }

  const eegStore = new EEGStorage();
  const edfData = await eegStore.getEDFFile();

  if (!edfData || !edfData.data) {
    showError("No EEG data found in IndexedDB");
    return;
  }

  await sendToFlaskAndLoadSignals(edfData.data, edfData.filename);
}

async function sendToFlaskAndLoadSignals(bufferArray, fileName) {
  try {
    const blob = new Blob([new Uint8Array(bufferArray)], {
      type: "application/octet-stream",
    });

    const formData = new FormData();
    formData.append("file", blob, fileName || "eeg.edf");

    const response = await fetch("http://localhost:5000/edf-preview", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Flask error: ${errorText}`);
    }

    const result = await response.json();
    console.log("✅ EDF Preview from Flask:", result);

    eegData = result;
    sampleRate = result.sample_rate;
    maxWindow = Math.floor(result.signals[0].length / sampleRate) - windowSize;

    populateChannelDropdown(result.channel_names);
    configureSlider();
    plotCurrentWindow(); // first window
  } catch (error) {
    console.error("❌ Error loading data:", error);
    showError(error.message);
  }
}

function populateChannelDropdown(channelNames) {
  const select = document.getElementById("channelSelect");
  select.innerHTML = "";

  for (const ch of channelNames) {
    const opt = document.createElement("option");
    opt.value = ch;
    opt.textContent = ch;
    select.appendChild(opt);
  }

  // Select first 3 channels by default
  for (let i = 0; i < Math.min(3, select.options.length); i++) {
    select.options[i].selected = true;
  }

  select.addEventListener("change", plotCurrentWindow);
}

function configureSlider() {
  const slider = document.getElementById("windowSlider");
  const label = document.getElementById("windowTimeLabel");

  slider.max = maxWindow;
  slider.value = 0;

  slider.addEventListener("input", () => {
    const startSec = parseInt(slider.value);
    label.textContent = `${startSec}s–${startSec + windowSize}s`;
    plotCurrentWindow();
  });

  label.textContent = `0s–${windowSize}s`;
}

function plotCurrentWindow() {
  const select = document.getElementById("channelSelect");
  const slider = document.getElementById("windowSlider");

  const selectedChannels = Array.from(select.selectedOptions).map((opt) => opt.value);
  const start = parseInt(slider.value) * sampleRate;
  const end = start + windowSize * sampleRate;

  const traces = [];

  selectedChannels.forEach((ch) => {
    const chIdx = eegData.channel_names.indexOf(ch);
    if (chIdx === -1) return;

    const signal = eegData.signals[chIdx].slice(start, end);
    const time = Array.from({ length: signal.length }, (_, i) => (start + i) / sampleRate);

    traces.push({
      x: time,
      y: signal,
      type: "scatter",
      mode: "lines",
      name: ch,
    });
  });

  const layout = {
    title: {
      text: `EEG Channels: ${selectedChannels.join(", ")}`,
      x: 0.5,
      font: { size: 18 },
    },
    xaxis: { title: "Time (s)" },
    yaxis: { title: "Amplitude (µV)" },
    margin: { l: 60, r: 40, t: 60, b: 50 },
    height: window.innerHeight - 60,
    showlegend: true,
  };

  Plotly.newPlot("plot", traces, layout, {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
  });
}

function showError(message) {
  const plotDiv = document.getElementById("plot");
  plotDiv.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; padding: 20px; text-align: center;">
      <div style="font-size: 18px; color: #d32f2f; margin-bottom: 20px; max-width: 600px; line-height: 1.4;">
        ${message}
      </div>
      <div style="padding: 15px; background: #f0f0f0; border-radius: 8px; font-size: 14px; max-width: 600px;">
        - Check browser console (F12) for detailed logs<br>
        - Ensure Flask API is running at http://localhost:5000<br>
        - Make sure CORS is enabled in Flask
      </div>
      <div style="margin-top: 20px;">
        <button onclick="window.location.reload()" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Reload Page</button>
      </div>
    </div>
  `;
}

document.getElementById("plot").innerHTML = `
  <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-size: 18px; color: #666;">
    🧠 Loading EEG data...
  </div>
`;

console.log("✅ Viewer script loaded successfully");
