import { readTxtFile } from './fileReader.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log("✅ DOM fully loaded");

  const input = document.getElementById('fileInput');
  const output = document.getElementById('output');

  if (!input) {
    console.error("❌ input#fileInput not found in DOM.");
    return;
  }

  if (!output) {
    console.error("❌ pre#output not found in DOM.");
    return;
  }

  input.addEventListener('change', (e) => {
    console.log("📥 File input changed.");

    const file = e.target.files[0];
    if (!file) {
      console.warn("⚠️ No file selected.");
      return;
    }

    console.log("📂 File selected:", file.name);

    if (!file.name.endsWith('.txt')) {
      alert('Please upload a .txt file.');
      console.warn("❌ Unsupported file type");
      return;
    }

    readTxtFile(file, (text) => {
      console.log("📄 File read successfully. Preview:");
      console.log(text.slice(0, 200)); // Print first 200 characters
      output.textContent = text;
    });
  });
});
