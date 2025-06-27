// Inject script into page context
const script = document.createElement('script');
script.src = chrome.runtime.getURL('scriptInjector.js');
(document.head || document.documentElement).appendChild(script);

// Listen for EEG file messages from page
window.addEventListener("message", async (event) => {
  if (event.source !== window || event.data.type !== "EEG_INTERCEPT") return;

  const href = event.data.href;
  console.log("📥 Intercepted:", href);

  try {
    const response = await fetch(href);
    const text = await response.text();

    chrome.storage.local.set({ eegDataText: text }, () => {
      chrome.runtime.sendMessage({ action: 'openViewer' });
    });
  } catch (err) {
    console.error("❌ Failed to fetch:", err);
  }
});