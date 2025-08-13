let eegStorage = null;

document.addEventListener("DOMContentLoaded", async function () {
  console.log("Popup loaded - Debug Version");

  try {
    await loadStorageHelper();
    eegStorage = new EEGStorage();
    console.log("EEG Storage initialized");
  } catch (error) {
    console.error("Failed to initialize EEG Storage:", error);
    console.log("Continuing without IndexedDB support");
  }

  const fileInput = document.getElementById("fileInput");
  const fileInputArea = document.getElementById("fileInputArea");

  if (!fileInput || !fileInputArea) {
    console.error("UI elements missing");
    return;
  }

  fileInputArea.addEventListener("click", function () {
    fileInput.click();
  });

  fileInput.addEventListener("change", async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    console.log("File selected:", file.name, file.size, "bytes");

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".txt") && !fileName.endsWith(".edf")) {
      alert("Only .txt and .edf files supported");
      return;
    }

    // Show processing state
    const originalText =
      fileInputArea.querySelector(".upload-text").textContent;
    fileInputArea.querySelector(".upload-text").textContent = "Processing...";

    try {
      if (fileName.endsWith(".edf")) {
        await handleEDFFileWithValidation(file);
      } else {
        await handleTextFileWithValidation(file);
      }
    } catch (error) {
      console.error("File processing error:", error);
      alert("Error: " + error.message);
    } finally {
      fileInputArea.querySelector(".upload-text").textContent = originalText;
    }
  });

  // EDF validation function
  function isValidEEGBuffer(buffer) {
    try {
      const header = new TextDecoder().decode(buffer.slice(0, 256));
      const ns = parseInt(header.slice(252, 256).trim());
      if (isNaN(ns) || ns <= 0) return false;

      const signalLabelsRaw = buffer.slice(256, 256 + ns * 16);
      const signalLabels = new TextDecoder()
        .decode(signalLabelsRaw)
        .toLowerCase();

      const eegKeywords = [
        "eeg",
        "fp1",
        "fp2",
        "fz",
        "cz",
        "pz",
        "oz",
        "f3",
        "f4",
        "c3",
        "c4",
        "p3",
        "p4",
        "o1",
        "o2",
        "t3",
        "t4",
        "t5",
        "t6",
      ];
      const nonEEGKeywords = ["emg", "ecg", "eog", "abdomen", "direct"];

      const hasEEG = eegKeywords.some((k) => signalLabels.includes(k));
      const isLikelyNotEEG = nonEEGKeywords.some((k) =>
        signalLabels.includes(k)
      );

      return hasEEG && !isLikelyNotEEG;
    } catch (e) {
      console.error("Error in EDF EEG detection:", e);
      return false;
    }
  }

  // Text validation function
  function isValidEEGText(text) {
    const lower = text.toLowerCase();
    if (lower.includes("<html") || lower.includes("<!doctype")) return false;

    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length < 10) return false;

    const avgLineLen =
      lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
    if (avgLineLen < 10) return false;

    const numericRatio = (text.match(/[-\d\.]/g) || []).length / text.length;
    if (numericRatio < 0.2) return false;

    return containsEEGKeywords(text);
  }

  function containsEEGKeywords(text) {
    const lower = text.toLowerCase();
    const eegKeywords = [
      "eeg",
      "exg",
      "fp1",
      "fp2",
      "fz",
      "cz",
      "pz",
      "oz",
      "t3",
      "t4",
      "t5",
      "t6",
      "channel",
      "sample_rate",
      "electrode",
    ];
    return eegKeywords.some((keyword) => lower.includes(keyword));
  }

  // EDF handler with validation
  async function handleEDFFileWithValidation(file) {
    console.log("Processing EDF file with validation:", file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      console.log("File read complete, buffer size:", arrayBuffer.byteLength);

      // Validate if this is actually an EEG file
      const validationResult = isValidEEGBuffer(arrayBuffer);

      if (!validationResult) {
        // Handle validation
        console.log("EDF validation failed: File does not contain EEG data");

        // Show user-friendly message
        alert(`This EDF file doesn't appear to contain EEG data.
It may be ECG, EMG, or other physiological data.
The viewer is specifically designed for EEG signals.`);

        return; // Exit without throwing error in console
      }

      // Clear both storage layers
      await chrome.storage.local.clear();
      console.log("Cleared chrome.storage.local");

      if (eegStorage) {
        await eegStorage.clearAllData();
        await eegStorage.storeEDFFile(arrayBuffer, file.name);
        console.log("Stored validated EDF in IndexedDB");
      }

      console.log("EEG EDF data stored, opening viewer...");
      setTimeout(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
      }, 100);
    } catch (error) {
      // Only log actual technical errors, not validation failures
      console.error("Technical error processing EDF file:", error);
      alert("Technical error processing file: " + error.message);
    }
  }

  // exit handler with validation
  async function handleTextFileWithValidation(file) {
    console.log("Processing text file with validation:", file.name);

    try {
      const text = await file.text();
      console.log("Text read complete, length:", text.length);

      // Validate if this is actually an EEG file
      const validationResult = isValidEEGText(text);

      if (!validationResult) {
        // Handle validation failure
        console.log("Text validation failed: File does not contain EEG data");

        // Show user-friendly message
        alert(`This text file doesn't appear to contain EEG data.
Please ensure your file contains EEG channel data with appropriate headers
(like EEG, FP1, FZ, CZ, etc.) and numeric signal values.`);

        return; // Exit without throwing console error
      }

      // Clear all previous data
      await chrome.storage.local.clear();
      if (eegStorage) {
        await eegStorage.clearAllData();
        await eegStorage.storeTextFile(text, file.name);
      }

      console.log("Validated EEG text stored, opening viewer...");
      setTimeout(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
      }, 100);
    } catch (error) {
      // Only log actual technical errors, not validation failures
      console.error("Technical error processing text file:", error);
      alert("Technical error processing file: " + error.message);
    }
  }

  async function loadStorageHelper() {
    if (typeof EEGStorage !== "undefined") {
      console.log("Storage helper already loaded");
      return;
    }

    try {
      await loadScript("eegStorage.js");
      console.log("Storage helper loaded");
    } catch (error) {
      console.warn("Storage helper failed to load:", error);
      throw error;
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(src);
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  const clearDataBtn = document.getElementById("clearDataBtn");
  if (clearDataBtn) {
    clearDataBtn.addEventListener("click", async function () {
      try {
        clearDataBtn.textContent = "Clearing...";
        clearDataBtn.disabled = true;
        chrome.storage.local.clear(() => {
          console.log("Chrome storage cleared");
          alert("All data cleared successfully!");
        });
        if (eegStorage) {
          await eegStorage.clearAllData();
        }
      } catch (error) {
        console.error("Error clearing data:", error);
        alert("Error clearing data: " + error.message);
      } finally {
        clearDataBtn.textContent = "Clear stored data";
        clearDataBtn.disabled = false;
      }
    });
  }

  const interceptToggle = document.getElementById("interceptToggle");
  const interceptStatus = document.getElementById("interceptStatus");

  if (interceptToggle) {
    interceptToggle.addEventListener("click", function () {
      chrome.runtime.sendMessage(
        { action: "toggleIntercept" },
        function (response) {
          if (response && response.enabled !== undefined) {
            updateToggle(response.enabled);
          }
        }
      );
    });
  }

  function updateToggle(enabled) {
    if (interceptToggle && interceptStatus) {
      if (enabled) {
        interceptToggle.classList.add("active");
        interceptStatus.textContent = "Download interception is ON";
      } else {
        interceptToggle.classList.remove("active");
        interceptStatus.textContent = "Download interception is OFF";
      }
    }
  }

  chrome.runtime.sendMessage(
    { action: "getInterceptState" },
    function (response) {
      if (response && response.enabled !== undefined) {
        updateToggle(response.enabled);
      } else {
        updateToggle(true);
      }
    }
  );
});
