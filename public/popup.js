document.addEventListener('DOMContentLoaded', function() {
  console.log('🔧 Popup loaded');
  
  // Get elements
  const interceptToggle = document.getElementById('interceptToggle');
  const interceptStatus = document.getElementById('interceptStatus');
  const fileInput = document.getElementById('fileInput');
  const fileInputArea = document.getElementById('fileInputArea');
  const clearDataBtn = document.getElementById('clearDataBtn');

  // Check if elements exist
  if (!interceptToggle || !interceptStatus || !fileInput || !fileInputArea || !clearDataBtn) {
    console.error('Some elements missing');
    return;
  }

  console.log('✅ All elements found');

  // Set up click handlers
  fileInputArea.addEventListener('click', function() {
    fileInput.click();
  });

  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.txt')) {
      alert('Only .txt files supported for manual upload');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      const text = e.target.result;
      chrome.storage.local.set({ eegDataText: text }, function() {
        chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
      });
    };
    reader.readAsText(file);
  });

  interceptToggle.addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'toggleIntercept' }, function(response) {
      if (response && response.enabled !== undefined) {
        updateToggle(response.enabled);
      }
    });
  });

  clearDataBtn.addEventListener('click', function() {
    chrome.storage.local.remove(['eegDataText'], function() {
      alert('Data cleared!');
    });
  });

  // Load initial state
  chrome.runtime.sendMessage({ action: 'getInterceptState' }, function(response) {
    if (response && response.enabled !== undefined) {
      updateToggle(response.enabled);
    } else {
      updateToggle(true); // default
    }
  });

  function updateToggle(enabled) {
    if (enabled) {
      interceptToggle.classList.add('active');
      interceptStatus.textContent = 'Download interception is ON';
    } else {
      interceptToggle.classList.remove('active');
      interceptStatus.textContent = 'Download interception is OFF';
    }
  }
});