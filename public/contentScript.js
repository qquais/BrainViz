console.log("🔧 EEG Content script starting on:", window.location.href);

function isExtensionContextValid() {
  try {
    return chrome?.runtime?.id !== undefined;
  } catch (e) {
    return false;
  }
}

// 🧠 EEG-specific keywords for validation
function containsEEGKeywords(text) {
  const lower = text.toLowerCase();
  const eegKeywords = [
    "eeg", "exg", "fp1", "fp2", "fz", "cz", "pz", "oz", "t3", "t4", "t5", "t6",
    "channel", "sample_rate", "electrode"
  ];
  return eegKeywords.some(keyword => lower.includes(keyword));
}

// ✅ Robust EEG validation
function isValidEEGText(text) {
  const lower = text.toLowerCase();
  if (lower.includes("<html") || lower.includes("<!doctype")) return false;

  const lines = text.split("\n").filter(line => line.trim().length > 0);
  if (lines.length < 10) return false;

  const avgLineLen = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
  if (avgLineLen < 10) return false;

  const numericRatio = (text.match(/[-\d\.]/g) || []).length / text.length;
  if (numericRatio < 0.2) return false;

  if (!containsEEGKeywords(text)) return false;

  return true;
}

function initializeEEGInterceptor() {
  console.log("🔧 Initializing EEG interceptor...");

  if (!isExtensionContextValid()) {
    console.error("❌ Extension context invalid at initialization");
    return;
  }

  if (window.eegContentScriptLoaded) {
    console.log("⚠️ EEG Content script already loaded, skipping");
    return;
  }
  window.eegContentScriptLoaded = true;

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("scriptInjector.js");
  script.onload = () => console.log("✅ Script injector loaded successfully");
  script.onerror = () => console.error("❌ Failed to load script injector");
  (document.head || document.documentElement).appendChild(script);

  const processedMessages = new Set();

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data.type !== "EEG_INTERCEPT") return;

    const href = event.data.href;
    if (processedMessages.has(href)) {
      console.log("⏭️ Already processing this URL, skipping:", href);
      return;
    }

    processedMessages.add(href);
    setTimeout(() => processedMessages.delete(href), 5000);

    console.log("📥 Content script received intercept message:", href);

    if (!isExtensionContextValid()) {
      console.error("❌ Extension context invalid, cannot process:", href);
      alert(`EEG Extension: Context lost. Please reload and try again.`);
      return;
    }

    try {
      const store = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error("Timeout")), 5000);
        chrome.storage.local.get(["interceptEnabled"], (data) => {
          clearTimeout(timeoutId);
          chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(data);
        });
      });

      if (store.interceptEnabled === false) {
        console.log("⏭️ Interception disabled, skipping");
        return;
      }

      const response = await fetch(href, {
        method: "GET",
        mode: "cors",
        cache: "no-cache",
        credentials: "omit",
        headers: { Accept: "text/plain,*/*" },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const text = await response.text();
      console.log("📄 Fetched text length:", text.length);

      const cleanFileName = href.split("/").pop().split("?")[0].toLowerCase();

      if (!isValidEEGText(text)) {
        console.log("⏭️ Not valid EEG content. Allowing normal download:", cleanFileName);
        window.location.href = href;
        return;
      }

      // ✅ Valid EEG, send to background for storage
      chrome.runtime.sendMessage({
        action: "storeTextEEG",
        text,
        filename: cleanFileName
      }, (res) => {
        console.log("📨 Background responded:", res);
      });

    } catch (err) {
      console.error("❌ Intercept failed:", err);
      alert(`EEG Extension Error: ${err.message}`);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeEEGInterceptor);
} else {
  initializeEEGInterceptor();
}

console.log("🔧 EEG Content script setup complete");
