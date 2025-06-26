import { readTxtFile } from './fileReader.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log("✅ DOM fully loaded");

  const input = document.getElementById('fileInput');

  if (!input) {
    console.error("❌ Missing file input element");
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

    const handleParsedEEGText = (text) => {
      const lines = text.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim());

      const timeData = [];
      const eegData = [];

      const channelIndex = 1; // Change this if you want another channel

      for (let i = 1; i < lines.length && i < 10000; i++) {
        const row = lines[i].split(',');
        const t = parseFloat(row[0]);
        const v = parseFloat(row[channelIndex]);
        if (!isNaN(t) && !isNaN(v)) {
          timeData.push(t);
          eegData.push(v);
        }
      }

      chrome.storage.local.set({ eegData, timeData }, () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
        console.log("✅ EEG data stored and viewer opened.");
      });
    };

    if (fileName.endsWith('.txt')) {
      readTxtFile(file, (text) => {
        console.log("📄 TXT file read successfully.");
        handleParsedEEGText(text);
      });

    } else if (fileName.endsWith('.zip')) {
      console.log("📦 ZIP file detected");
      const zip = new JSZip();

      try {
        const zipData = await zip.loadAsync(file);
        const txtFileName = Object.keys(zipData.files).find(name => name.endsWith('.txt'));

        if (!txtFileName) {
          alert("❌ No .txt file found in ZIP.");
          return;
        }

        const txtContent = await zipData.files[txtFileName].async('string');
        handleParsedEEGText(txtContent);

      } catch (err) {
        console.error("❌ Failed to read ZIP file", err);
        alert("❌ Error reading ZIP file.");
      }

    } else {
      alert("Please upload a .txt or .zip file.");
      console.warn("❌ Unsupported file type");
    }
  });
});
