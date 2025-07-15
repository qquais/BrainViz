let eegData = null;
let sampleRate = 256;
let windowSize = 10;
let maxWindow = 0;
let currentFileName = "Unknown File";
let isStackedView = true;
let psdVisible = false;

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
    const blob = new Blob([new Uint8Array(bufferArray)], {
      type: "application/octet-stream",
    });
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
  maxWindow = Math.max(
    0,
    Math.floor(result.signals[0].length / sampleRate) - windowSize
  );
  document.getElementById("fileLabel").textContent = `File: ${currentFileName}`;
  populateChannelList(result.channel_names);
  configureSlider();
  document.getElementById("toggleViewBtn").textContent =
    "Switch to Compact View";
  plotCurrentWindow();

  document.getElementById("toggleViewBtn").onclick = () => {
    isStackedView = !isStackedView;
    document.getElementById("toggleViewBtn").textContent = isStackedView
      ? "Switch to Compact View"
      : "Switch to Stacked View";
    plotCurrentWindow();
  };

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

  document
    .getElementById("showPsdBtn")
    .addEventListener("click", handlePsdToggle);
}

function populateChannelList(channelNames) {
  setupChannelToggleButtons();
  const container = document.getElementById("channelList");
  if (!container) return;
  container.innerHTML = "";

  channelNames.forEach((ch) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = ch;
    input.checked = true;

    input.addEventListener("change", () => {
      plotCurrentWindow();

      if (psdVisible) {
        const selected = Array.from(
          document.querySelectorAll("#channelList input:checked")
        ).map((cb) => cb.value);
        updatePSDPlot(selected);
      }
    });

    label.appendChild(input);
    label.appendChild(document.createTextNode(ch));
    container.appendChild(label);
  });
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
  const plotDiv = document.getElementById("plot");
  plotDiv.innerHTML = "";

  const slider = document.getElementById("windowSlider");
  const selectedChannels = Array.from(
    document.querySelectorAll("#channelList input:checked")
  ).map((cb) => cb.value);

  const start = parseInt(slider.value) * sampleRate;
  const end = start + windowSize * sampleRate;

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
      const chIdx = eegData.channel_names.indexOf(ch);
      const signal = eegData.signals[chIdx].slice(start, end);
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
        hovertemplate: `<b>${ch}</b><br>Time: %{x:.2f}s<br>Value: %{y:.2f}<extra></extra>`,
      });

      layout[`xaxis${idx + 1}`] = {
        title: idx === selectedChannels.length - 1 ? "Time (s)" : "",
        showticklabels: idx === selectedChannels.length - 1,
      };
      layout[`yaxis${idx + 1}`] = {
        title: ch.length > 12 ? ch.slice(0, 10) + "…" : ch,
        titlefont: { size: 10 },
        tickfont: { size: 10 },
        zeroline: false,
      };
    });

    Plotly.newPlot("plot", data, layout, { responsive: true });
  } else {
    const traces = selectedChannels.map((ch) => {
      const chIdx = eegData.channel_names.indexOf(ch);
      const signal = eegData.signals[chIdx].slice(start, end);
      const time = Array.from(
        { length: signal.length },
        (_, i) => (start + i) / sampleRate
      );
      return {
        x: time,
        y: signal,
        type: "scatter",
        mode: "lines",
        name: ch,
        line: { width: 1.2 },
      };
    });

    const layout = {
      title: { text: `EEG Signal (Compact)`, x: 0.5 },
      xaxis: { title: "Time (s)" },
      yaxis: { title: "Amplitude (µV)" },
      height: window.innerHeight - 140,
      margin: { l: 60, r: 40, t: 40, b: 60 },
      showlegend: true,
    };

    Plotly.newPlot("plot", traces, layout, { responsive: true });
  }
}

async function handlePsdToggle() {
  const selectedChannels = Array.from(
    document.querySelectorAll("#channelList input:checked")
  ).map((cb) => cb.value);

  if (!selectedChannels.length) {
    alert("Select at least one channel to view PSD");
    return;
  }

  if (!psdVisible) {
    await updatePSDPlot(selectedChannels);
    document.getElementById("psdPlot").style.display = "block";
    document.getElementById("showPsdBtn").textContent = "Hide PSD";
    psdVisible = true;
  } else {
    document.getElementById("psdPlot").style.display = "none";
    document.getElementById("showPsdBtn").textContent = "Show PSD";
    psdVisible = false;
  }
}

async function updatePSDPlot(selectedChannels) {
  const psdDiv = document.getElementById("psdPlot");
  psdDiv.innerHTML = ""; // ✅ Clear any previous plot

  if (!selectedChannels.length) {
    alert("⚠️ Please select at least one channel to compute PSD.");
    return;
  }

  try {
    const selectedIndices = selectedChannels.map((ch) =>
      eegData.channel_names.indexOf(ch)
    );
    const selectedSignals = selectedIndices.map((i) => eegData.signals[i]);

    const res = await fetch("http://localhost:5000/psd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signals: selectedSignals,
        sample_rate: sampleRate,
      }),
    });

    if (!res.ok) throw new Error(await res.text());

    const psdData = await res.json();
    if (psdData.error) throw new Error(psdData.error);

    const traces = psdData.psd.map((spectrum, i) => ({
      x: psdData.freqs,
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
    alert("PSD Error: " + err.message);
  }
}

function setupChannelToggleButtons() {
  const selectAllBtn = document.getElementById("selectAllBtn");
  const unselectAllBtn = document.getElementById("unselectAllBtn");

  selectAllBtn.addEventListener("click", () => {
    document.querySelectorAll("#channelList input[type='checkbox']").forEach(cb => cb.checked = true);
    plotCurrentWindow();
    if (psdVisible) updatePSDPlot(getSelectedChannels());
  });

  unselectAllBtn.addEventListener("click", () => {
    document.querySelectorAll("#channelList input[type='checkbox']").forEach(cb => cb.checked = false);
    plotCurrentWindow();
    if (psdVisible) updatePSDPlot(getSelectedChannels());
  });
}

function getSelectedChannels() {
  return Array.from(document.querySelectorAll("#channelList input:checked")).map(cb => cb.value);
}

function showError(message) {
  const plotDiv = document.getElementById("plot");
  plotDiv.innerHTML = `<div class="error-container"><h3>Error</h3><p>${message}</p></div>`;
}
