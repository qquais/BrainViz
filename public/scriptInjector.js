/**
 * Page-injected script for EEG file link detection and interception
 * Runs in the page context to monitor link clicks and identify EEG files
 * 
 * @fileoverview Injected script that detects EEG file links and sends interception messages
 * @version: 1.5 - Updated July 16, 2025
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
   * Analyze a URL to determine if it might be an EEG file.
   * Uses file extension + ?download param as a rough guess (not real validation).
   * 
   * @param {string} url
   * @returns {boolean}
   */
  function isEEGFile(url) {
    if (!url) return false;

    const urlWithoutParams = url.split('?')[0];
    const hasEEGExtension =
      urlWithoutParams.endsWith('.txt') ||
      urlWithoutParams.endsWith('.edf') ||
      urlWithoutParams.endsWith('.csv');

    const hasEEGPattern = url.toLowerCase().includes('eeg') || 
                          url.toLowerCase().includes('records');

    const hasDownloadParam = url.includes('?download') || url.includes('&download');

    const extensionMatchOnly = hasEEGExtension && hasDownloadParam;

    console.log("🔍 URL extension-based guess (not real EEG check):", {
      url,
      extensionMatched: extensionMatchOnly,
      hasEEGExtension,
      hasDownloadParam,
      hasEEGPattern
    });

    return extensionMatchOnly;
  }

  /**
   * Intercept link click events and trigger EEG capture if matched.
   */
  function handleLinkClick(e) {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.href || link.getAttribute('href');
    const matched = isEEGFile(href);

    console.log("📎 Link clicked:", href, "→ extension match:", matched);

    if (matched) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      console.log("🧠 EEG candidate link intercepted:", href);
      window.postMessage({ type: "EEG_INTERCEPT", href }, "*");
      return false;
    }
  }

  document.addEventListener('click', handleLinkClick, {
    capture: true,
    passive: false
  });

  console.log("✅ EEG interceptor initialized with safe extension-based detection");
}
