// Load EEGStorage class into background service worker
importScripts('eegStorage.js');
console.log("🚀 Background script loaded");

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

chrome.downloads.onCreated.addListener((downloadItem) => {
  console.log("📥 Download detected:", downloadItem.url, downloadItem.filename);

  if (isEEGDownload(downloadItem.url)) {
    chrome.storage.local.get(["interceptEnabled"], (store) => {
      const enabled = store.interceptEnabled !== false;
      console.log("🔧 Intercept enabled:", enabled);

      if (enabled) {
        chrome.downloads.cancel(downloadItem.id, () => {
          console.log("🚫 Cancelled download:", downloadItem.url);
          handleDownload(downloadItem.url);
        });
      }
    });
  }
});

async function handleDownload(url) {
  console.log("📡 Fetching intercepted file:", url);
  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      console.log("❌ Response is HTML, not file data - aborting");
      return;
    }

    const isEDF = url.toLowerCase().endsWith(".edf");

    if (isEDF) {
      const arrayBuffer = await response.arrayBuffer();
      await chrome.storage.local.clear();

      chrome.storage.local.set(
        {
          eegDataBuffer: Array.from(new Uint8Array(arrayBuffer)),
          eegDataType: "edf",
        },
        () => {
          console.log("💾 EDF data stored, opening viewer");
          chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
        }
      );
    } else {
      const text = await response.text();

      if (
        text.toLowerCase().includes("<!doctype") ||
        text.toLowerCase().includes("<html")
      ) {
        console.log("❌ Content appears to be HTML, not EEG data");
        return;
      }

      await chrome.storage.local.clear();

      chrome.storage.local.set(
        {
          eegDataText: text,
          eegDataType: "text",
        },
        () => {
          console.log("💾 Text data stored, opening viewer");
          chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
        }
      );
    }
  } catch (error) {
    console.error("❌ Failed to fetch:", error);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("📨 Message received:", msg.action);

  if (msg.action === "openViewer") {
    chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
    sendResponse({ success: true });
  }

  else if (msg.action === "toggleIntercept") {
    chrome.storage.local.get(["interceptEnabled"], (store) => {
      const newState = !store.interceptEnabled;
      chrome.storage.local.set({ interceptEnabled: newState }, () => {
        sendResponse({ enabled: newState });
      });
    });
    return true;
  }

  else if (msg.action === "getInterceptState") {
    chrome.storage.local.get(["interceptEnabled"], (store) => {
      const enabled = store.interceptEnabled !== false;
      sendResponse({ enabled });
    });
    return true;
  }

  else if (msg.action === "storeTextEEG") {
    console.log("📨 Background: storing text EEG from content script");

    (async () => {
      try {
        const eegStorage = new EEGStorage();
        await eegStorage.clearAllData();
        await eegStorage.storeTextFile(msg.text, msg.filename || "uploaded.txt");

        console.log("✅ Text EEG stored in IndexedDB. Opening viewer...");

        chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") }, () => {
          sendResponse({ success: true });
        });
      } catch (err) {
        console.error("❌ Failed to store EEG in background:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true;
  }

  // ✅ NEW handler for EDF from content script
  else if (msg.action === "storeEDFURL") {
    console.log("📡 Fetching EDF file from URL:", msg.url);

    (async () => {
      try {
        const response = await fetch(msg.url);
        const buffer = await response.arrayBuffer();

        const eegStorage = new EEGStorage();
        await eegStorage.clearAllData();
        await eegStorage.storeEDFFile(buffer, msg.filename);

        console.log("✅ Stored EDF file. Opening viewer...");
        chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") }, () => {
          sendResponse({ success: true });
        });
      } catch (err) {
        console.error("❌ Failed to fetch/store EDF:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("🧠 EEG Reader installed");
  chrome.storage.local.set({ interceptEnabled: true }, () => {
    console.log("✅ Default settings applied");
  });
});
