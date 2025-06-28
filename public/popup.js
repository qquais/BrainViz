/**
 * Popup interface controller for EEG Reader extension
 * Manages the extension's popup UI, file uploads, and intercept settings
 * 
 * @fileoverview Popup script that handles user interactions with the extension control panel
 * @author EEG Reader Extension
 * @version 1.4
 * @since 1.0
 */

/**
 * Initializes the popup interface when the DOM is loaded
 * Sets up event listeners for all UI controls and loads current state
 * 
 * @listens document.DOMContentLoaded
 * @returns {void}
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log('🔧 Popup loaded');
  
  // Get all UI elements
  const interceptToggle = document.getElementById('interceptToggle');
  const interceptStatus = document.getElementById('interceptStatus');
  const fileInput = document.getElementById('fileInput');
  const fileInputArea = document.getElementById('fileInputArea');
  const clearDataBtn = document.getElementById('clearDataBtn');

  // Validate that all required elements exist
  if (!interceptToggle || !interceptStatus || !fileInput || !fileInputArea || !clearDataBtn) {
    console.error('Some elements missing');
    return;
  }

  console.log('✅ All elements found');

  /**
   * Handles click events on the file input area
   * Triggers the hidden file input when the upload area is clicked
   * 
   * @listens fileInputArea.click
   * @returns {void}
   */
  fileInputArea.addEventListener('click', function() {
    fileInput.click();
  });

  /**
   * Handles file selection and processing for manual uploads
   * Validates file type, reads content, and opens the EEG viewer
   * 
   * @listens fileInput.change
   * @param {Event} e - The file input change event
   * @returns {void}
   * 
   * @throws {Error} When file reading fails
   */
  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.txt')) {
      alert('Only .txt files supported for manual upload');
      return;
    }

    const reader = new FileReader();
    
    /**
     * Handles successful file reading
     * Stores the file content and opens the EEG viewer
     * 
     * @param {ProgressEvent} e - The FileReader load event
     * @returns {void}
     */
    reader.onload = function(e) {
      const text = e.target.result;
      chrome.storage.local.set({ eegDataText: text }, function() {
        chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
      });
    };
    
    reader.readAsText(file);
  });

  /**
   * Handles intercept toggle button clicks
   * Sends message to background script to toggle interception state
   * 
   * @listens interceptToggle.click
   * @returns {void}
   */
  interceptToggle.addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'toggleIntercept' }, function(response) {
      if (response && response.enabled !== undefined) {
        updateToggle(response.enabled);
      }
    });
  });

  /**
   * Handles clear data button clicks
   * Removes stored EEG data from extension storage
   * 
   * @listens clearDataBtn.click
   * @returns {void}
   */
  clearDataBtn.addEventListener('click', function() {
    chrome.storage.local.remove(['eegDataText'], function() {
      alert('Data cleared!');
    });
  });

  /**
   * Updates the visual state of the intercept toggle switch
   * Changes the toggle appearance and status text based on enabled state
   * 
   * @param {boolean} enabled - Whether interception is currently enabled
   * @returns {void}
   * 
   * @example
   * updateToggle(true);  // Shows "Download interception is ON"
   * updateToggle(false); // Shows "Download interception is OFF"
   */
  function updateToggle(enabled) {
    if (enabled) {
      interceptToggle.classList.add('active');
      interceptStatus.textContent = 'Download interception is ON';
    } else {
      interceptToggle.classList.remove('active');
      interceptStatus.textContent = 'Download interception is OFF';
    }
  }

  // Load initial intercept state from background script
  chrome.runtime.sendMessage({ action: 'getInterceptState' }, function(response) {
    if (response && response.enabled !== undefined) {
      updateToggle(response.enabled);
    } else {
      updateToggle(true); // default to enabled
    }
  });
});