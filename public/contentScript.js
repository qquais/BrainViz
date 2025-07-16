console.log("EEG Content script starting on:", window.location.href);

function isExtensionContextValid() {
  try {
    return chrome?.runtime?.id !== undefined;
  } catch (e) {
    return false;
  }
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

function initializeEEGInterceptor() {
  if (!isExtensionContextValid()) return;

  if (window.eegContentScriptLoaded) return;
  window.eegContentScriptLoaded = true;

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("scriptInjector.js");
  document.head.appendChild(script);

  const processedMessages = new Set();

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data.type !== "EEG_INTERCEPT") return;

    const href = event.data.href;
    if (processedMessages.has(href)) return;

    processedMessages.add(href);
    setTimeout(() => processedMessages.delete(href), 5000);

    const fileName = href.split("/").pop().split("?")[0].toLowerCase();

    try {
      if (fileName.endsWith(".edf")) {
        chrome.runtime.sendMessage(
          {
            action: "storeEDFURL",
            url: href,
            filename: fileName,
          },
          (res) => {
            console.log("📨 Background response:", res);
            if (res?.success === false) {
              console.warn(
                "⛔ Not EEG — allow default browser download:",
                href
              );
              window.location.href = href;
            }
          }
        );
        return;
      }

      if (fileName.endsWith(".txt")) {
        const response = await fetch(href);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const text = await response.text();
        if (!isValidEEGText(text)) {
          window.location.href = href;
          return;
        }

        chrome.runtime.sendMessage(
          {
            action: "storeTextEEG",
            text,
            filename: fileName,
          },
          (res) => {
            if (res?.success === false) {
              alert("EEG Viewer failed to open.");
            }
          }
        );

        return;
      }

      window.location.href = href;
    } catch (err) {
      alert(`EEG Extension Error: ${err.message}`);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeEEGInterceptor);
} else {
  initializeEEGInterceptor();
}
