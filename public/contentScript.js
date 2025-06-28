/**
 * Content script for EEG file interception on web pages
 * Injects page scripts and handles EEG file processing requests
 * 
 * @fileoverview Content script that bridges page context and extension context for EEG file handling
 * @author EEG Reader Extension
 * @version 1.4
 */

console.log("🔧 EEG Content script starting on:", window.location.href);

/**
 * Validates that the Chrome extension context is still available
 * Used to prevent errors when extension is reloaded or disabled
 * 
 * @returns {boolean} True if extension context is valid and accessible
 * 
 * @example
 * if (isExtensionContextValid()) {
 *   // Safe to use chrome.* APIs
 * }
 */
function isExtensionContextValid() {
  try {
    return chrome?.runtime?.id !== undefined;
  } catch (e) {
    return false;
  }
}

/**
 * Initializes the EEG interceptor system on the current page
 * Sets up script injection and message handling for EEG file interception
 * 
 * @returns {void}
 * 
 * @throws {Error} When extension context is invalid
 */
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

  /**
   * Handles EEG file interception messages from the injected page script
   * Processes the URL, validates content, and opens the EEG viewer
   * 
   * @listens window.message
   * @param {MessageEvent} event - The message event from the page
   * @returns {Promise<void>} Resolves when processing is complete
   */
  window.addEventListener("message", async (event) => {
    // Filter for our specific message type
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