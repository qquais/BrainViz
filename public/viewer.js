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

// const FLASK_API = "https://brainviz.opensource.mieweb.org";
const FLASK_API = "http://localhost:5000";
console.log("Using EEG API:", FLASK_API);

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
  if (!timeSliderCanvas || !sliderCtx) {
    console.error("Canvas or context not available");
    return;
  }

  const rect = timeSliderCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  console.log("Drawing slider:", {
    width,
    height,
    totalDurationSec,
    windowStartSec,
    maxWindow,
  });

  sliderCtx.clearRect(0, 0, width, height);
  sliderCtx.fillStyle = "#f8f8f8";
  sliderCtx.fillRect(0, 0, width, height);
  sliderCtx.strokeStyle = "#ddd";
  sliderCtx.lineWidth = 1;
  sliderCtx.strokeRect(0, 0, width, height);

  if (totalDurationSec <= 0) {
    console.warn("Invalid total duration:", totalDurationSec);
    return;
  }

  const timeSpan = totalDurationSec;
  let majorInterval = 10;

  // Adjust intervals based on duration for optimal display
  if (timeSpan > 3600)
    majorInterval = 300; // 5 minutes for very long recordings
  else if (timeSpan > 1800) majorInterval = 180; // 3 minutes
  else if (timeSpan > 600) majorInterval = 60; // 1 minute
  else if (timeSpan > 300) majorInterval = 30; // 30 seconds
  else if (timeSpan > 120) majorInterval = 20; // 20 seconds
  else if (timeSpan > 60) majorInterval = 10; // 10 seconds
  else if (timeSpan > 30) majorInterval = 5; // 5 seconds
  else majorInterval = Math.max(1, Math.ceil(timeSpan / 10)); // At least 10 divisions

  // Draw vertical time lines - Neurosoft style
  sliderCtx.strokeStyle = "#ccc";
  sliderCtx.lineWidth = 1;

  for (let t = 0; t <= timeSpan; t += majorInterval) {
    const x = (t / timeSpan) * width;

    // Major vertical line
    sliderCtx.beginPath();
    sliderCtx.moveTo(x, 0);
    sliderCtx.lineTo(x, height);
    sliderCtx.stroke();
  }

  // Draw minor vertical lines for better granularity
  sliderCtx.strokeStyle = "#e5e5e5";
  const minorInterval = majorInterval / (majorInterval > 60 ? 4 : 2);
  for (let t = minorInterval; t < timeSpan; t += minorInterval) {
    if (t % majorInterval !== 0) {
      const x = (t / timeSpan) * width;
      sliderCtx.beginPath();
      sliderCtx.moveTo(x, height - 8);
      sliderCtx.lineTo(x, height);
      sliderCtx.stroke();
    }
  }

  sliderCtx.font = "9px Arial";
  sliderCtx.fillStyle = "#666";
  sliderCtx.textAlign = "center";

  for (let t = 0; t <= timeSpan; t += majorInterval) {
    const x = (t / timeSpan) * width;
    if (x < width - 30) {
      sliderCtx.fillText(formatTime(t), x, height - 2);
    }
  }

  // Calculate current viewing window position
  const windowStartX = (windowStartSec / timeSpan) * width;
  const windowEndX = Math.min(
    ((windowStartSec + windowSize) / timeSpan) * width,
    width
  );
  const windowWidth = windowEndX - windowStartX;

  console.log("Window position:", { windowStartX, windowEndX, windowWidth });

  sliderCtx.fillStyle = "rgba(66, 133, 244, 0.3)";
  sliderCtx.fillRect(windowStartX, 0, windowWidth, height);

  // Window border
  sliderCtx.strokeStyle = "#4285f4";
  sliderCtx.lineWidth = 2;
  sliderCtx.strokeRect(windowStartX, 0, windowWidth, height);

  // Current position slider handle - blue triangle at start of window
  sliderCtx.fillStyle = "#4285f4";
  sliderCtx.strokeStyle = "#1a73e8";
  sliderCtx.lineWidth = 2;

  // Slider handle (triangle pointing down) - positioned at window start
  const handleSize = 10;
  sliderCtx.beginPath();
  sliderCtx.moveTo(windowStartX, 0);
  sliderCtx.lineTo(windowStartX - handleSize / 2, handleSize);
  sliderCtx.lineTo(windowStartX + handleSize / 2, handleSize);
  sliderCtx.closePath();
  sliderCtx.fill();
  sliderCtx.stroke();

  // Vertical position line at window start
  sliderCtx.strokeStyle = "#4285f4";
  sliderCtx.lineWidth = 2;
  sliderCtx.beginPath();
  sliderCtx.moveTo(windowStartX, handleSize);
  sliderCtx.lineTo(windowStartX, height);
  sliderCtx.stroke();

  // If window is large enough, also show end marker
  if (windowWidth > 20 && timeSpan > windowSize) {
    sliderCtx.strokeStyle = "rgba(66, 133, 244, 0.8)";
    sliderCtx.lineWidth = 2;
    sliderCtx.beginPath();
    sliderCtx.moveTo(windowEndX, 0);
    sliderCtx.lineTo(windowEndX, height);
    sliderCtx.stroke();
  }
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

  // Calculate new window start position - allows navigation through entire recording
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
  const selectedChannels = getSelectedChannels();

  const psdDiv = document.getElementById("psdPlot");

  if (!selectedChannels.length) {
    psdDiv.style.display = "block";
    psdDiv.innerHTML = `<div style="padding: 10px 20px; color: red;">Please select at least one channel to view PSD.</div>`;

    document.getElementById("showPsdBtn").textContent = "Show PSD";
    psdVisible = false;
    return;
  }

  if (!psdVisible) {
    await updatePSDPlot(selectedChannels);
    psdDiv.style.display = "block";
    document.getElementById("showPsdBtn").textContent = "Hide PSD";
    psdVisible = true;
  } else {
    psdDiv.style.display = "none";
    document.getElementById("showPsdBtn").textContent = "Show PSD";
    psdVisible = false;
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

function getSelectedChannels() {
  return Array.from(
    document.querySelectorAll("#channelList input:checked")
  ).map((cb) => cb.value);
}

function showError(message) {
  const plotDiv = document.getElementById("plot");
  plotDiv.innerHTML = `<div class="error-container"><h3>Error</h3><p>${message}</p></div>`;
}
