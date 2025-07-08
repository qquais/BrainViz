/**
 * Page-injected script for EEG file link detection and interception
 * Runs in the page context to monitor link clicks and identify EEG files
 * 
 * @fileoverview Injected script that detects EEG file links and sends interception messages
 * @author EEG Reader Extension
 * @version 1.4
 */

console.log("🔧 Script injector loaded on:", window.location.hostname);

// Prevent multiple initialization
if (window.eegInterceptorInitialized) {
  console.log("⚠️ EEG interceptor already initialized, skipping");
} else {
  window.eegInterceptorInitialized = true;

  // Track processed clicks to prevent duplicates
  const processedClicks = new Set();

  /**
   * Analyzes a URL to determine if it represents an EEG file that should be intercepted
   * Uses multiple heuristics including file extensions, URL patterns, and content indicators
   * 
   * @param {string} url - The URL to analyze for EEG file characteristics  
   * @returns {boolean} True if the URL should be intercepted as an EEG file
   * 
   * @example
   * isEEGFile('https://physionet.org/files/data.txt') // true
   * isEEGFile('https://physionet.org/content/dataset/page.txt') // false (content page)
   * isEEGFile('https://example.com/data.txt?download=1') // true (has download param)
   */
  function isEEGFile(url) {
    if (!url) return false;
    
    // Remove query parameters for checking
    const urlWithoutParams = url.split('?')[0];
    const hasEEGExtension = urlWithoutParams.endsWith('.txt') || 
                           urlWithoutParams.endsWith('.zip') || 
                           urlWithoutParams.endsWith('.edf') ||
                           urlWithoutParams.endsWith('.csv');
    
    // Also check if URL contains EEG-related patterns
    const hasEEGPattern = url.includes('.txt') || 
                         url.includes('.zip') || 
                         url.includes('eeg') ||
                         url.includes('EEG') ||
                         url.includes('RECORDS');
    
    // Check for download parameter (PhysioNet style)
    const hasDownloadParam = url.includes('?download') || url.includes('&download');
    
    const isEEG = hasEEGExtension || (hasEEGPattern && hasDownloadParam);
    
    console.log("🔍 URL analysis:", {
      url: url,
      urlWithoutParams: urlWithoutParams,
      hasEEGExtension: hasEEGExtension,
      hasEEGPattern: hasEEGPattern,
      hasDownloadParam: hasDownloadParam,
      isEEG: isEEG
    });
    
    return isEEG;
  }

  /**
   * Handles link click events to detect and intercept EEG file downloads
   * Prevents default behavior for EEG files and sends interception message
   * 
   * @param {MouseEvent} e - The click event on a link element
   * @returns {boolean|void} False if event was intercepted, void otherwise
   * 
   * @listens document.click
   */
function handleLinkClick(e) {
  const link = e.target.closest('a');
  if (!link) return;

  const href = link.href || link.getAttribute('href');
  const isEEG = isEEGFile(href); // your existing heuristics

  console.log("🔍 Link clicked:", href, "isEEG:", isEEG);

  if (isEEG) {
    // Only prevent default if we're going to handle it
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    console.log("🧠 Intercepted EEG link click:", href);
    window.postMessage({ type: "EEG_INTERCEPT", href }, "*");
    return false;
  }
}


  // Single event listener for all cases
  document.addEventListener('click', handleLinkClick, { 
    capture: true, 
    passive: false 
  });

  console.log("✅ EEG interceptor initialized with enhanced URL detection");
}