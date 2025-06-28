console.log("🔧 EEG Content script starting on:", window.location.href);

// Function to check if extension context is valid
function isExtensionContextValid() {
  try {
    return chrome?.runtime?.id !== undefined;
  } catch (e) {
    return false;
  }
}

// Wait for page to be ready
function initializeEEGInterceptor() {
  console.log("🔧 Initializing EEG interceptor...");
  
  // Check context before doing anything
  if (!isExtensionContextValid()) {
    console.error("❌ Extension context invalid at initialization");
    return;
  }
  
  // Prevent multiple initialization
  if (window.eegContentScriptLoaded) {
    console.log("⚠️ EEG Content script already loaded, skipping");
    return;
  }
  window.eegContentScriptLoaded = true;

  // Inject script into page context
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('scriptInjector.js');
  script.onload = () => console.log("✅ Script injector loaded successfully");
  script.onerror = () => console.error("❌ Failed to load script injector");
  (document.head || document.documentElement).appendChild(script);

  // Track processed messages to prevent duplicates
  const processedMessages = new Set();

  // Listen for EEG file messages from page
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data.type !== "EEG_INTERCEPT") return;

    const href = event.data.href;
    
    // Prevent duplicate processing
    if (processedMessages.has(href)) {
      console.log("⏭️ Already processing this URL, skipping:", href);
      return;
    }
    
    processedMessages.add(href);
    // Clear after 5 seconds
    setTimeout(() => processedMessages.delete(href), 5000);

    console.log("📥 Content script received intercept message:", href);

    // Check extension context before proceeding
    if (!isExtensionContextValid()) {
      console.error("❌ Extension context invalid, cannot process:", href);
      // Show user-friendly message
      alert(`EEG Extension: Context lost, please reload the page and try again.\n\nFile: ${href}`);
      return;
    }

    try {
      // Use timeout to avoid infinite hanging on storage access
      const storagePromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Storage access timeout'));
        }, 5000);

        chrome.storage.local.get(['interceptEnabled'], (store) => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(store);
          }
        });
      });

      const store = await storagePromise;
      const enabled = store.interceptEnabled !== false;
      console.log("🔧 Intercept enabled:", enabled);
      
      if (!enabled) {
        console.log("⏭️ Interception disabled, ignoring");
        return;
      }

      console.log("📡 Fetching via content script:", href);
      
      // Try fetch with proper headers for CORS
      const response = await fetch(href, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'omit',
        headers: {
          'Accept': 'text/plain,*/*',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      console.log("📡 Content script fetch response:", response.status);
      
      const text = await response.text();
      console.log("📄 Content script got text, length:", text.length);

      // Check context again before storage operation
      if (!isExtensionContextValid()) {
        console.error("❌ Extension context lost during fetch");
        return;
      }

      // Use timeout for storage set as well
      const setStoragePromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Storage set timeout'));
        }, 5000);

        chrome.storage.local.set({ eegDataText: text }, () => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });

      await setStoragePromise;
      console.log("💾 Content script stored data, sending message to background");
      
      // Check context before messaging
      if (!isExtensionContextValid()) {
        console.error("❌ Extension context lost before messaging");
        return;
      }

      // Use timeout for runtime messaging
      const messagePromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Runtime message timeout'));
        }, 5000);

        chrome.runtime.sendMessage({ action: 'openViewer' }, (response) => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });

      const response_msg = await messagePromise;
      console.log("📨 Background response:", response_msg);
      
    } catch (err) {
      console.error("❌ Content script operation failed:", err);
      
      // Show user-friendly error message
      if (err.message.includes('context') || err.message.includes('Extension')) {
        alert(`EEG Extension: Extension context lost.\n\nPlease:\n1. Reload this page\n2. Try clicking the link again\n\nFile: ${href}`);
      } else {
        alert(`EEG Extension: Failed to process file.\n\nError: ${err.message}\nFile: ${href}\n\nThe file will download normally instead.`);
      }
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeEEGInterceptor);
} else {
  initializeEEGInterceptor();
}

console.log("🔧 EEG Content script setup complete");