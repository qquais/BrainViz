import { readTxtFile } from './fileReader.js';

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('fileInput');
  const output = document.getElementById('output');

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    console.log("📂 File selected:", fileName);

    if (fileName.endsWith('.txt')) {
      readTxtFile(file, (text) => {
        chrome.storage.local.set({ eegDataText: text }, () => {
          chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
        });
      });

    } else if (fileName.endsWith('.zip')) {
      const zip = new JSZip();
      const zipData = await zip.loadAsync(file);
      const txtFileName = Object.keys(zipData.files).find(name => name.endsWith('.txt'));
      if (!txtFileName) {
        output.textContent = "❌ No .txt file found in ZIP.";
        return;
      }
      const txtContent = await zipData.files[txtFileName].async('string');
      chrome.storage.local.set({ eegDataText: txtContent }, () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
      });
    }
  });
});
