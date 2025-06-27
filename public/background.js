// Download interception
chrome.downloads.onCreated.addListener((downloadItem) => {
  const url = downloadItem.url.toLowerCase();
  
  if (url.endsWith('.txt') || url.endsWith('.zip')) {
    chrome.storage.local.get(['interceptEnabled'], (store) => {
      const enabled = store.interceptEnabled !== false; // default true
      
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
  try {
    const response = await fetch(url);
    const text = await response.text();
    
    chrome.storage.local.set({ eegDataText: text }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
    });
  } catch (error) {
    console.error("Failed to fetch:", error);
  }
}

// Handle messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'openViewer') {
    chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
    sendResponse({ success: true });
    
  } else if (msg.action === 'toggleIntercept') {
    chrome.storage.local.get(['interceptEnabled'], (store) => {
      const newState = !store.interceptEnabled;
      chrome.storage.local.set({ interceptEnabled: newState }, () => {
        sendResponse({ enabled: newState });
      });
    });
    return true;
    
  } else if (msg.action === 'getInterceptState') {
    chrome.storage.local.get(['interceptEnabled'], (store) => {
      sendResponse({ enabled: store.interceptEnabled !== false });
    });
    return true;
  }
});

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  console.log("🧠 EEG Reader installed");
  chrome.storage.local.set({ interceptEnabled: true });
});