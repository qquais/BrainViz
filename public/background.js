importScripts("eegStorage.js");

// Logger added so that it doesn't generate console errors
const logger = {
  info: (msg, ...args) => console.log(`[EEG-BG] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[EEG-BG-DEBUG] ${msg}`, ...args),
  warn: (msg, ...args) => console.log(`[EEG-BG-WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.log(`[EEG-BG-ERROR] ${msg}`, ...args)
};

logger.info("Background script loaded");

function isEEGDownload(url) {
  if (!url) return false;
  const urlLower = url.toLowerCase();

  const hasEEGExtension =
    urlLower.endsWith(".txt") ||
    urlLower.endsWith(".edf") ||
    urlLower.endsWith(".csv");

  if (!hasEEGExtension) return false;
  if (urlLower.endsWith(".edf")) return true;

  const hasEEGPatterns =
    urlLower.includes("eeg") ||
    urlLower.includes("signal") ||
    urlLower.includes("brain") ||
    urlLower.includes("neuro") ||
    urlLower.includes("physionet") ||
    urlLower.includes("biosignal") ||
    urlLower.includes("electrode");

  const hasNonEEGPatterns =
    urlLower.includes("readme") ||
    urlLower.includes("license") ||
    urlLower.includes("changelog") ||
    urlLower.includes("config") ||
    urlLower.includes("log");

  if (hasNonEEGPatterns) return false;
  if (urlLower.endsWith(".txt") && !hasEEGPatterns) return false;
  if (urlLower.endsWith(".txt") && hasEEGPatterns) return true;

  return false;
}

function isValidEEGBuffer(buffer) {
  try {
    // Basic buffer validation
    if (!buffer || buffer.byteLength < 256) {
      return false;
    }

    const header = new TextDecoder().decode(buffer.slice(0, 256));
    const ns = parseInt(header.slice(252, 256).trim());
    
    if (isNaN(ns) || ns <= 0) {
      return false;
    }

    // Ensure we have enough data for signal labels
    const expectedLabelSize = 256 + ns * 16;
    if (buffer.byteLength < expectedLabelSize) {
      return false;
    }

    const signalLabelsRaw = buffer.slice(256, expectedLabelSize);
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
    const isLikelyNotEEG = nonEEGKeywords.some((k) => signalLabels.includes(k));

    return hasEEG && !isLikelyNotEEG;
  } catch (e) {
    return false;
  }
}

chrome.downloads.onCreated.addListener((downloadItem) => {
  if (isEEGDownload(downloadItem.url)) {
    chrome.storage.local.get(["interceptEnabled"], (store) => {
      const enabled = store.interceptEnabled !== false;
      if (enabled) {
        chrome.downloads.cancel(downloadItem.id, () => {
          handleDownload(downloadItem.url);
        });
      }
    });
  }
});

async function handleDownload(url) {
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      logger.debug(`HTTP ${response.status} for ${url}`);
      return;
    }

    const isEDF = url.toLowerCase().endsWith(".edf");

    if (isEDF) {
      const arrayBuffer = await response.arrayBuffer();
      if (!isValidEEGBuffer(arrayBuffer)) {
        logger.debug(`File validation: Not EEG data, allowing default download: ${url}`);
        return;
      } 
      await chrome.storage.local.clear();
      chrome.storage.local.set(
        {
          eegDataBuffer: Array.from(new Uint8Array(arrayBuffer)),
          eegDataType: "edf",
        },
        () => {
          chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
        }
      );
    } else {
      const text = await response.text();
      if (
        text.toLowerCase().includes("<html") ||
        text.toLowerCase().includes("<!doctype")
      ) {
        logger.debug(`File appears to be HTML, skipping: ${url}`);
        return;
      }

      await chrome.storage.local.clear();
      chrome.storage.local.set(
        {
          eegDataText: text,
          eegDataType: "text",
        },
        () => {
          chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
        }
      );
    }
  } catch (error) {
    logger.debug(`Fetch failed for ${url}:`, error.message);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "openViewer") {
    chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
    sendResponse({ success: true });
  } else if (msg.action === "toggleIntercept") {
    chrome.storage.local.get(["interceptEnabled"], (store) => {
      const newState = !store.interceptEnabled;
      chrome.storage.local.set({ interceptEnabled: newState }, () => {
        sendResponse({ enabled: newState });
      });
    });
    return true;
  } else if (msg.action === "getInterceptState") {
    chrome.storage.local.get(["interceptEnabled"], (store) => {
      const enabled = store.interceptEnabled !== false;
      sendResponse({ enabled });
    });
    return true;
  } else if (msg.action === "storeTextEEG") {
    (async () => {
      try {
        const eegStorage = new EEGStorage();
        await eegStorage.clearAllData();
        await eegStorage.storeTextFile(
          msg.text,
          msg.filename || "uploaded.txt"
        );
        chrome.tabs.create(
          { url: chrome.runtime.getURL("viewer.html") },
          () => {
            sendResponse({ success: true });
          }
        );
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  } else if (msg.action === "storeEDFURL") {
    (async () => {
      let responded = false;
      try {
        const response = await fetch(msg.url, { redirect: "follow" });
        if (!response.ok) {
          logger.debug(`HTTP ${response.status} for ${msg.url}`);
          sendResponse({ success: false, error: `HTTP ${response.status}` });
          responded = true;
          return;
        }

        const buffer = await response.arrayBuffer();
        
        if (!isValidEEGBuffer(buffer)) {
          logger.debug(`Validation failed: Not EEG data - ${msg.url}`);
          sendResponse({ success: false, reason: "not_eeg" });
          responded = true;
          return;
        }

        const eegStorage = new EEGStorage();
        await eegStorage.clearAllData();
        await eegStorage.storeEDFFile(buffer, msg.filename);

        chrome.tabs.create(
          { url: chrome.runtime.getURL("viewer.html") },
          () => {
            sendResponse({ success: true });
          }
        );
        responded = true;
      } catch (err) {
        logger.debug("storeEDFURL error:", err.message);
        if (!responded) {
          sendResponse({ success: false, error: err.message });
        }
      }
    })();
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ interceptEnabled: true });
});