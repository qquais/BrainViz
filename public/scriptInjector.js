/**
 * Page-injected script for EEG file link detection and interception
 * Runs in the page context to monitor link clicks and identify EEG files
 * 
 * @fileoverview Injected script that detects EEG file links and sends interception messages
 */

// Simple logger that doesn't generate console errors
const logger = {
  info: (msg, ...args) => console.log(`[EEG-INJECTOR] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[EEG-INJECTOR-DEBUG] ${msg}`, ...args),
  warn: (msg, ...args) => console.log(`[EEG-INJECTOR-WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.log(`[EEG-INJECTOR-ERROR] ${msg}`, ...args)
};

logger.debug("Script injector loaded on:", window.location.hostname);

// Prevent multiple initialization
if (window.eegInterceptorInitialized) {
  logger.debug("EEG interceptor already initialized, skipping");
} else {
  window.eegInterceptorInitialized = true;

  // Track processed clicks to prevent duplicates
  const processedClicks = new Set();

  /**
   * Analyze a URL to determine if it might be an EEG file.
   * 
   * @param {string} url
   * @returns {boolean}
   */
  function isEEGFile(url) {
    try {
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

      logger.debug("URL extension-based analysis:", {
        url: url.substring(0, 100) + (url.length > 100 ? "..." : ""),
        extensionMatched: extensionMatchOnly,
        hasEEGExtension,
        hasDownloadParam,
        hasEEGPattern
      });

      return extensionMatchOnly;
    } catch (e) {
      // Silent failure for URL analysis
      return false;
    }
  }

  /**
   * Intercept link click events and trigger EEG capture if matched.
   */
  function handleLinkClick(e) {
    try {
      const link = e.target.closest('a');
      if (!link) return;

      const href = link.href || link.getAttribute('href');
      const matched = isEEGFile(href);

      logger.debug("Link clicked analysis:", {
        href: href ? href.substring(0, 100) + (href.length > 100 ? "..." : "") : "null",
        matched: matched
      });

      if (matched) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        logger.debug("EEG candidate link intercepted:", href.substring(0, 100) + (href.length > 100 ? "..." : ""));
        window.postMessage({ type: "EEG_INTERCEPT", href }, "*");
        return false;
      }
    } catch (e) {
      // Silent failure - don't break normal link behavior
      logger.debug("Error in link click handler:", e.message);
    }
  }

  // Add event listener with error protection
  try {
    document.addEventListener('click', handleLinkClick, {
      capture: true,
      passive: false
    });

    logger.debug("EEG interceptor initialized with safe extension-based detection");
  } catch (e) {
    logger.debug("Failed to initialize EEG interceptor:", e.message);
  }
}