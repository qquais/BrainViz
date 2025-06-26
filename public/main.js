import { readTxtFile } from './fileReader.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log("✅ DOM fully loaded");

  const input = document.getElementById('fileInput');
  const output = document.getElementById('output');

  if (!input || !output) {
    console.error("❌ Missing fileInput or output element");
    return;
  }

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) {
      console.warn("⚠️ No file selected");
      return;
    }

    const fileName = file.name.toLowerCase();
    console.log("📂 File selected:", fileName);

    if (fileName.endsWith('.txt')) {
      readTxtFile(file, (text) => {
        console.log("📄 TXT file read successfully.");
        plotEEG(text); // ✅ Plot instead of just displaying
      });

    } else if (fileName.endsWith('.zip')) {
      console.log("📦 ZIP file detected");

      const zip = new JSZip();

      try {
        const zipData = await zip.loadAsync(file);
        const txtFileName = Object.keys(zipData.files).find(name => name.endsWith('.txt'));

        if (!txtFileName) {
          output.style.display = 'block';
          output.textContent = "❌ No .txt file found in ZIP.";
          return;
        }

        console.log("📄 Found .txt in ZIP:", txtFileName);

        const txtContent = await zipData.files[txtFileName].async('string');
        plotEEG(txtContent); // ✅ Plot instead of displaying
        console.log("✅ .txt content extracted and ready for plot.");

      } catch (err) {
        console.error("❌ Failed to read ZIP file", err);
        output.style.display = 'block';
        output.textContent = "❌ Error reading ZIP file.";
      }

    } else {
      alert("Please upload a .txt or .zip file.");
      console.warn("❌ Unsupported file type");
    }
  });
});

// ✅ EEG Plotting Function
function plotEEG(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) {
    document.getElementById("output").textContent = "❌ Not enough data to plot.";
    document.getElementById("output").style.display = "block";
    return;
  }

  const headers = lines[0].split(',').map(h => h.trim());
  const time = [];
  const signal = [];

  const channelIndex = 1; // You can change this later to plot other channels

  for (let i = 1; i < lines.length && i < 10000; i++) {
    const row = lines[i].split(',');
    const t = parseFloat(row[0]);
    const v = parseFloat(row[channelIndex]);
    if (!isNaN(t) && !isNaN(v)) {
      time.push(t);
      signal.push(v);
    }
  }

  Plotly.newPlot("chart", [{
    x: time,
    y: signal,
    type: 'scatter',
    mode: 'lines',
    name: headers[channelIndex]
  }], {
    title: `EEG Signal - ${headers[channelIndex]}`,
    xaxis: { title: 'Time (s)' },
    yaxis: { title: 'Amplitude (µV)' }
  });

  console.log("✅ EEG signal plotted with", signal.length, "samples.");
}
