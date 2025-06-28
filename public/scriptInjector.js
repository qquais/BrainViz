console.log("🔧 Script injector loaded on:", window.location.hostname);

// Prevent multiple initialization
if (window.eegInterceptorInitialized) {
  console.log("⚠️ EEG interceptor already initialized, skipping");
} else {
  window.eegInterceptorInitialized = true;

  // Track processed clicks to prevent duplicates
  const processedClicks = new Set();

  // Enhanced EEG file detection
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

  // Single unified click handler
  function handleLinkClick(e) {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.href || link.getAttribute('href') || '';
    const isEEG = isEEGFile(href);

    console.log("🔍 Link clicked:", href, "isEEG:", isEEG);

    if (isEEG) {
      // Check if we already processed this click
      if (processedClicks.has(href)) {
        console.log("⏭️ Already processing this link, skipping");
        return;
      }
      
      processedClicks.add(href);
      // Clear after 2 seconds to allow re-clicks
      setTimeout(() => processedClicks.delete(href), 2000);

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