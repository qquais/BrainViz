/**
 * Fixed Popup interface controller with enhanced debugging
 */

let eegStorage = null;

document.addEventListener('DOMContentLoaded', async function() {
  console.log('🔧 Popup loaded - Debug Version');

  try {
    await loadStorageHelper();
    eegStorage = new EEGStorage();
    console.log('✅ EEG Storage initialized');
  } catch (error) {
    console.error('❌ Failed to initialize EEG Storage:', error);
    // Continue without storage helper for basic functionality
    console.log('⚠️ Continuing without IndexedDB support');
  }

  const fileInput = document.getElementById('fileInput');
  const fileInputArea = document.getElementById('fileInputArea');

  if (!fileInput || !fileInputArea) {
    console.error('❌ UI elements missing');
    return;
  }

  fileInputArea.addEventListener('click', function() {
    fileInput.click();
  });

  fileInput.addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    console.log('📁 File selected:', file.name, file.size, 'bytes');

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.txt') && !fileName.endsWith('.edf')) {
      alert('Only .txt and .edf files supported');
      return;
    }

    // Show processing state
    const originalText = fileInputArea.querySelector('.upload-text').textContent;
    fileInputArea.querySelector('.upload-text').textContent = 'Processing...';

    try {
      if (fileName.endsWith('.edf')) {
        await handleEDFFileSimple(file);
      } else {
        await handleTextFileSimple(file);
      }
    } catch (error) {
      console.error('❌ File processing error:', error);
      alert('Error: ' + error.message);
    } finally {
      fileInputArea.querySelector('.upload-text').textContent = originalText;
    }
  });

  // Simplified EDF handling without complex validation
  async function handleEDFFileSimple(file) {
    console.log('🔬 Processing EDF file (simple method):', file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      console.log('📄 File read complete, buffer size:', arrayBuffer.byteLength);

      // Store as array for Chrome storage compatibility
      const bufferArray = Array.from(new Uint8Array(arrayBuffer));
      
      // Store data with multiple methods for compatibility
      const storageData = {
        eegDataBuffer: bufferArray,
        eegDataType: 'edf',
        eegDataSource: 'chrome_storage',
        eegFileName: file.name,
        eegDataSize: arrayBuffer.byteLength,
        eegDataTimestamp: Date.now()
      };

      await setStorageData(storageData);
      
      console.log('💾 EDF data stored, opening viewer...');
      
      // Small delay to ensure storage is complete
      setTimeout(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
      }, 100);

    } catch (error) {
      console.error('❌ EDF processing failed:', error);
      throw new Error(`EDF processing failed: ${error.message}`);
    }
  }

  // Simplified text handling
  async function handleTextFileSimple(file) {
    console.log('📄 Processing text file:', file.name);

    try {
      const text = await file.text();
      console.log('📄 Text read complete, length:', text.length);

      const storageData = {
        eegDataText: text,
        eegDataType: 'text', 
        eegDataSource: 'chrome_storage',
        eegFileName: file.name,
        eegDataSize: text.length,
        eegDataTimestamp: Date.now()
      };

      await setStorageData(storageData);
      
      console.log('💾 Text data stored, opening viewer...');
      
      // Small delay to ensure storage is complete
      setTimeout(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
      }, 100);

    } catch (error) {
      console.error('❌ Text processing failed:', error);
      throw new Error(`Text processing failed: ${error.message}`);
    }
  }

  // Enhanced storage function with error handling
  function setStorageData(data) {
    return new Promise((resolve, reject) => {
      console.log('💾 Storing data:', Object.keys(data));
      
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          console.error('❌ Storage error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('✅ Data stored successfully');
          // Verify storage worked
          chrome.storage.local.get(Object.keys(data), (result) => {
            console.log('🔍 Verification - stored keys:', Object.keys(result));
            resolve();
          });
        }
      });
    });
  }

  // Storage helper loading (optional)
  async function loadStorageHelper() {
    if (typeof EEGStorage !== 'undefined') {
      console.log('✅ Storage helper already loaded');
      return;
    }
    
    try {
      await loadScript('eegStorage.js');
      console.log('✅ Storage helper loaded');
    } catch (error) {
      console.warn('⚠️ Storage helper failed to load:', error);
      throw error;
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(src);
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  // Clear data button
  const clearDataBtn = document.getElementById('clearDataBtn');
  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', async function() {
      try {
        clearDataBtn.textContent = 'Clearing...';
        clearDataBtn.disabled = true;
        
        // Clear Chrome storage
        chrome.storage.local.clear(() => {
          console.log('✅ Chrome storage cleared');
          alert('All data cleared successfully!');
        });
        
        // Clear IndexedDB if available
        if (eegStorage) {
          await eegStorage.clearAllData();
        }
        
      } catch (error) {
        console.error('❌ Error clearing data:', error);
        alert('Error clearing data: ' + error.message);
      } finally {
        clearDataBtn.textContent = 'Clear stored data';
        clearDataBtn.disabled = false;
      }
    });
  }

  // Toggle functionality (existing code)
  const interceptToggle = document.getElementById('interceptToggle');
  const interceptStatus = document.getElementById('interceptStatus');

  if (interceptToggle) {
    interceptToggle.addEventListener('click', function() {
      chrome.runtime.sendMessage({ action: 'toggleIntercept' }, function(response) {
        if (response && response.enabled !== undefined) {
          updateToggle(response.enabled);
        }
      });
    });
  }

  function updateToggle(enabled) {
    if (interceptToggle && interceptStatus) {
      if (enabled) {
        interceptToggle.classList.add('active');
        interceptStatus.textContent = 'Download interception is ON';
      } else {
        interceptToggle.classList.remove('active');  
        interceptStatus.textContent = 'Download interception is OFF';
      }
    }
  }

  // Get initial state
  chrome.runtime.sendMessage({ action: 'getInterceptState' }, function(response) {
    if (response && response.enabled !== undefined) {
      updateToggle(response.enabled);
    } else {
      updateToggle(true);
    }
  });
});