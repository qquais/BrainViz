const logger = {
  info: (msg, ...args) => console.log(`[EEG-CS] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[EEG-CS-DEBUG] ${msg}`, ...args),
  warn: (msg, ...args) => console.log(`[EEG-CS-WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.log(`[EEG-CS-ERROR] ${msg}`, ...args)
};

logger.debug("EEG Content script starting on:", window.location.href);

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
  try {
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
  } catch (e) {
    return false;
  }
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
            logger.debug("Background response:", res);
            
            // Handle different failure reasons gracefully
            if (res?.success === false) {
              if (res?.reason === "not_eeg") {
                logger.debug("File validation: Not EEG data, allowing default download:", href);
              } else {
                logger.debug("Processing failed, allowing default download:", href);
              }
              // Allow default browser download by navigating to the URL
              window.location.href = href;
            }
          }
        );
        return;
      }

      if (fileName.endsWith(".txt")) {
        try {
          const response = await fetch(href);
          if (!response.ok) {
            logger.debug(`HTTP ${response.status} for ${href}`);
            window.location.href = href;
            return;
          }

          const text = await response.text();
          
          if (!isValidEEGText(text)) {
            logger.debug("Text validation: Not EEG data, allowing default download:", href);
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
                logger.debug("EEG Viewer failed to open for:", href);
                window.location.href = href;
              }
            }
          );

          return;
        } catch (fetchError) {
          logger.debug("Fetch error for text file:", fetchError.message);
          window.location.href = href;
          return;
        }
      }

      window.location.href = href;
    } catch (err) {
      logger.debug(`Processing error for ${href}:`, err.message);
      window.location.href = href;
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeEEGInterceptor);
} else {
  initializeEEGInterceptor();
}