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
let currentEEGBlob = null;

// const FLASK_API = "https://brainviz.opensource.mieweb.org";
const FLASK_API = "http://localhost:5000";
console.log("Using EEG API:", FLASK_API);

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initializeViewer();
    const topoBtn = document.getElementById("topomap10HzBtn");
    if (topoBtn) {
      topoBtn.addEventListener("click", () => fetchTopomap(10));
    }
    
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
    currentEEGBlob = blob;
    const formData = new FormData();
    formData.append("file", blob, currentFileName);

    const response = await fetch(`${FLASK_API}/edf-preview`, {
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
    currentEEGBlob = blob;
    const formData = new FormData();
    formData.append("file", blob, currentFileName);

    const response = await fetch(`${FLASK_API}/txt-preview`, {
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
  totalDurationSec = Math.floor(result.signals[0].length / sampleRate);
  windowSize = 10;
  maxWindow = Math.max(0, totalDurationSec - windowSize);
  windowStartSec = 0;

  console.log("EEG Data initialized:", {
    totalDurationSec: totalDurationSec.toFixed(1),
    maxWindow: maxWindow.toFixed(1),
    signalLength: result.signals[0].length,
    sampleRate,
    windowSize,
    channels: result.channel_names.length,
  });

  document.getElementById(
    "fileLabel"
  ).textContent = `File: ${currentFileName} (${totalDurationSec.toFixed(0)}s)`;
  populateChannelList(result.channel_names);

  // Initialize slider after a small delay to ensure DOM is ready
  setTimeout(() => {
    initEEGTimeSlider();
  }, 100);

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
      const res = await fetch(`${FLASK_API}/filter-signal`, {
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
    } catch (err) {
      alert("Error applying filter: " + err.message);
    }
  });

  document
    .getElementById("rejectorSelect")
    .addEventListener("change", async (e) => {
      const value = e.target.value;

      if (value === "off") {
        const eegStore = new EEGStorage();
        const edfData = await eegStore.getEDFFile();
        if (edfData?.data) {
          await sendToFlaskAndLoadSignals(edfData.data);
        } else {
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
            await sendTextToFlaskAndLoadSignals(textResult.data);
          }
        }
      } else if (value === "50" || value === "60") {
        try {
          const res = await fetch(`${FLASK_API}/filter-signal`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              signals: eegData.signals,
              sample_rate: sampleRate,
              filter_type: "notch",
              l_freq: parseFloat(value),
            }),
          });

          const result = await res.json();
          if (result.error) throw new Error(result.error);

          eegData.signals = result.filtered;
          plotCurrentWindow();
        } catch (err) {
          console.error("Rejector error:", err.message);
        }
      }
    });

  document
    .getElementById("showPsdBtn")
    .addEventListener("click", handlePsdToggle);
}

function initEEGTimeSlider() {
  timeSliderCanvas = document.getElementById("eegTimeSlider");
  if (!timeSliderCanvas) {
    console.error("Timeline canvas not found!");
    return;
  }

  sliderCtx = timeSliderCanvas.getContext("2d");
  const container = timeSliderCanvas.parentElement;
  const containerRect = container.getBoundingClientRect();
  timeSliderCanvas.style.width = "100%";
  timeSliderCanvas.style.height = "30px";
  const rect = timeSliderCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  timeSliderCanvas.width = rect.width * dpr;
  timeSliderCanvas.height = rect.height * dpr;

  sliderCtx.scale(dpr, dpr);

  console.log("Canvas initialized:", {
    width: rect.width,
    height: rect.height,
    totalDuration: totalDurationSec,
  });

  drawSlider();

  timeSliderCanvas.addEventListener("mousedown", onSliderMouseDown);
  window.addEventListener("mouseup", () => (dragging = false));
  window.addEventListener("mousemove", onSliderMouseMove);
  document.addEventListener("keydown", handleKeyNavigation);

  // Handle window resize
  window.addEventListener("resize", () => {
    setTimeout(() => {
      const newRect = timeSliderCanvas.getBoundingClientRect();
      timeSliderCanvas.width = newRect.width * dpr;
      timeSliderCanvas.height = newRect.height * dpr;
      sliderCtx.scale(dpr, dpr);
      drawSlider();
    }, 100);
  });
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
    console.log(`Keyboard navigation: moved to ${windowStartSec.toFixed(1)}s`);
    drawSlider();
    plotCurrentWindow();
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function drawSlider() {
  if (!timeSliderCanvas || !sliderCtx) return;

  const rect = timeSliderCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  sliderCtx.clearRect(0, 0, width, height);
  sliderCtx.fillStyle = "#ffffff";
  sliderCtx.fillRect(0, 0, width, height);
  sliderCtx.strokeStyle = "#ddd";
  sliderCtx.strokeRect(0, 0, width, height);

  if (totalDurationSec <= 0) return;

  const timeSpan = totalDurationSec;
  const cursorX = (windowStartSec / timeSpan) * width;

  // Only draw the vertical slider line
  sliderCtx.beginPath();
  sliderCtx.strokeStyle = "#888"; // grey
  sliderCtx.lineWidth = 4;
  sliderCtx.moveTo(cursorX, 0);
  sliderCtx.lineTo(cursorX, height);
  sliderCtx.stroke();
  sliderCtx.lineWidth = 1; // reset

  // Time label on top of the line
  sliderCtx.fillStyle = "#333";
  sliderCtx.font = "10px Arial";
  sliderCtx.textAlign = "center";
  sliderCtx.fillText(formatTime(windowStartSec), cursorX, 10);
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
  ); // Round to 0.1s precision

  console.log("Slider moved:", {
    percent: percent.toFixed(3),
    newWindowStart: newWindowStart.toFixed(1),
    windowStartSec: windowStartSec.toFixed(1),
    maxStart: maxStart.toFixed(1),
    totalDuration: totalDurationSec,
  });

  drawSlider();
  plotCurrentWindow();
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

function plotCurrentWindow() {
  const plotDiv = document.getElementById("plot");
  plotDiv.innerHTML = "";

  const selectedChannels = Array.from(
    document.querySelectorAll("#channelList input:checked")
  ).map((cb) => cb.value);

  const start = windowStartSec * sampleRate;
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
  const plotDiv = document.getElementById("plot");
  const psdDiv = document.getElementById("psdPlot");
  const timeline = document.getElementById("timelineContainer");
  const viewToggleBtn = document.getElementById("toggleViewBtn");
  const psdBtn = document.getElementById("showPsdBtn");
  const bottomControls = document.getElementById("bottomControls");
  const fileTitle = document.getElementById("fileTitle");

  if (!psdVisible) {
    // Switch to PSD mode
    plotDiv.style.display = "none";
    timeline.style.display = "none";
    bottomControls.style.display = "none";
    viewToggleBtn.style.display = "none";
    psdDiv.style.display = "block";
    psdBtn.textContent = "Back to EEG";

    const selectedChannels = getSelectedChannels();
    if (!selectedChannels.length) {
      psdDiv.innerHTML = `<div style="padding: 20px; color: red;">Please select at least one channel for PSD.</div>`;
      return;
    }

    await updatePSDPlot(selectedChannels);
    psdVisible = true;
  } else {
    // Back to EEG mode
    plotDiv.style.display = "block";
    timeline.style.display = "block";
    bottomControls.style.display = "flex";
    viewToggleBtn.style.display = "inline-block";
    fileTitle.style.justifyContent = "space-between";
    psdDiv.style.display = "none";
    psdBtn.textContent = "Show PSD";
    psdVisible = false;
    plotCurrentWindow();
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

    const res = await fetch(`${FLASK_API}/psd`, {
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
    psdDiv.innerHTML = `<div style="padding: 20px; color: red;">PSD Error: ${err.message}</div>`;
  }
}

function setupChannelToggleButtons() {
  const toggleAllCheckbox = document.getElementById("toggleAllCheckbox");
  if (!toggleAllCheckbox) return;

  toggleAllCheckbox.addEventListener("change", () => {
    const checked = toggleAllCheckbox.checked;
    document
      .querySelectorAll("#channelList input[type='checkbox']")
      .forEach((cb) => (cb.checked = checked));

    plotCurrentWindow();
    if (psdVisible) updatePSDPlot(getSelectedChannels());
  });
}

async function fetchTopomap(freq) {
  if (!currentEEGBlob) {
    alert("EEG data not available yet.");
    return;
  }
  
  try {
    const formData = new FormData();
    formData.append("file", currentEEGBlob, "eeg.edf");
    formData.append("freq", freq);

    const response = await fetch(`${FLASK_API}/psd-topomap`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Topomap failed: ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    // Show image in a popup or container
    const container = document.getElementById("topomapContainer");
    const img = document.getElementById("topomapImage");
    
    if (img && container) {
      img.src = url;
      container.style.display = "block";
      img.style.display = "block";
    }
    
    console.log("Topomap displayed successfully");
    
  } catch (error) {
    console.error("Topomap error:", error);
    alert(`Topomap failed: ${error.message}`);
  }
}

function getSelectedChannels() {
  return Array.from(
    document.querySelectorAll("#channelList input:checked")
  ).map((cb) => cb.value);
}

function showError(message) {
  const plotDiv = document.getElementById("plot");
  plotDiv.innerHTML = `<div class="error-container"><h3>Error</h3><p>${message}</p></div>`;
}
