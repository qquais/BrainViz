console.log("🚀 Background script loaded");

// More selective EEG file detection for downloads
function isEEGDownload(url) {
  if (!url) return false;
  
  console.log("🔍 Checking download URL:", url);
  
  // Only intercept downloads that are clearly EEG files
  const urlLower = url.toLowerCase();
  
  // 1. Must have a file extension we care about
  const hasEEGExtension = urlLower.endsWith('.txt') || 
                         urlLower.endsWith('.zip') || 
                         urlLower.endsWith('.edf') ||
                         urlLower.endsWith('.csv');
  
  if (!hasEEGExtension) {
    console.log("⏭️ No EEG file extension, ignoring");
    return false;
  }
  
  // 2. Additional patterns that suggest it's actually EEG data
  const hasEEGPatterns = urlLower.includes('eeg') ||
                        urlLower.includes('signal') ||
                        urlLower.includes('brain') ||
                        urlLower.includes('neuro') ||
                        urlLower.includes('physionet') ||
                        urlLower.includes('biosignal') ||
                        urlLower.includes('electrode');
  
  // 3. Avoid intercepting general txt files that aren't EEG
  const hasNonEEGPatterns = urlLower.includes('readme') ||
                           urlLower.includes('license') ||
                           urlLower.includes('changelog') ||
                           urlLower.includes('config') ||
                           urlLower.includes('log');
  
  if (hasNonEEGPatterns) {
    console.log("⏭️ Appears to be non-EEG text file, ignoring");
    return false;
  }
  
  // 4. For .txt files, be more selective
  if (urlLower.endsWith('.txt') && !hasEEGPatterns) {
    // Only intercept .txt files if they have EEG-related patterns
    console.log("⏭️ Plain .txt file without EEG patterns, ignoring");
    return false;
  }
  
  // 5. .zip files are more likely to be data files, but still check
  if (urlLower.endsWith('.zip') || urlLower.endsWith('.edf')) {
    console.log("🎯 .zip/.edf file detected, likely EEG data");
    return true;
  }
  
  // 6. Final decision for .txt files
  if (urlLower.endsWith('.txt') && hasEEGPatterns) {
    console.log("🎯 EEG .txt file detected");
    return true;
  }
  
  console.log("⏭️ Doesn't match EEG criteria, ignoring");
  return false;
}

// Download interception
chrome.downloads.onCreated.addListener((downloadItem) => {
  console.log("📥 Download detected:", downloadItem.url, downloadItem.filename);
  
  if (isEEGDownload(downloadItem.url)) {
    console.log("🎯 EEG file detected:", downloadItem.url);
    
    chrome.storage.local.get(['interceptEnabled'], (store) => {
      const enabled = store.interceptEnabled !== false; // default true
      console.log("🔧 Intercept enabled:", enabled);
      
      if (enabled) {
        chrome.downloads.cancel(downloadItem.id, () => {
          console.log("🚫 Cancelled download:", downloadItem.url);
          handleDownload(downloadItem.url);
        });
      } else {
        console.log("⏭️ Interception disabled, allowing download");
      }
    });
  } else {
    console.log("⏭️ Not an EEG file, ignoring");
  }
});

async function handleDownload(url) {
  console.log("📡 Fetching intercepted file:", url);
  try {
    const response = await fetch(url);
    console.log("📡 Fetch response:", response.status, response.statusText);
    
    // Check content type
    const contentType = response.headers.get('content-type') || '';
    console.log("📄 Content type:", contentType);
    
    if (contentType.includes('text/html')) {
      console.log("❌ Response is HTML, not file data - aborting");
      return;
    }
    
    const text = await response.text();
    console.log("📄 File content length:", text.length);
    
    // Basic validation that it's not HTML
    if (text.toLowerCase().includes('<!doctype') || text.toLowerCase().includes('<html')) {
      console.log("❌ Content appears to be HTML, not EEG data");
      return;
    }
    
    chrome.storage.local.set({ eegDataText: text }, () => {
      console.log("💾 Data stored, opening viewer");
      chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
    });
  } catch (error) {
    console.error("❌ Failed to fetch:", error);
  }
}

// Handle messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("📨 Message received:", msg.action);
  
  if (msg.action === 'openViewer') {
    chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
    sendResponse({ success: true });
    
  } else if (msg.action === 'toggleIntercept') {
    chrome.storage.local.get(['interceptEnabled'], (store) => {
      const newState = !store.interceptEnabled;
      console.log("🔄 Toggling intercept to:", newState);
      chrome.storage.local.set({ interceptEnabled: newState }, () => {
        sendResponse({ enabled: newState });
      });
    });
    return true;
    
  } else if (msg.action === 'getInterceptState') {
    chrome.storage.local.get(['interceptEnabled'], (store) => {
      const enabled = store.interceptEnabled !== false;
      console.log("❓ Intercept state requested:", enabled);
      sendResponse({ enabled: enabled });
    });
    return true;
  }
});

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  console.log("🧠 EEG Reader installed");
  chrome.storage.local.set({ interceptEnabled: true }, () => {
    console.log("✅ Default settings applied");
  });
});