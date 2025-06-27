// Enhanced scriptInjector.js for PhysioNet compatibility

console.log("🔧 Script injector loaded on:", window.location.hostname);

document.addEventListener('click', function(e) {
  const link = e.target.closest('a');
  if (!link) return;

  const href = link.href || '';
  const isEEG = href.endsWith('.txt') || href.endsWith('.zip');

  console.log("🔍 Link clicked:", href, "isEEG:", isEEG);

  if (isEEG) {
    e.preventDefault();
    e.stopPropagation();
    console.log("🧠 Intercepted link click:", href);
    window.postMessage({ type: "EEG_INTERCEPT", href }, "*");
    return false;
  }
});

// Also intercept download buttons and file links
document.addEventListener('click', function(e) {
  // Check if clicked element or parent has download attribute
  let element = e.target;
  for (let i = 0; i < 3; i++) { // Check up to 3 levels up
    if (!element) break;
    
    if (element.tagName === 'A' || element.hasAttribute('download')) {
      const href = element.href || element.getAttribute('href') || '';
      const isEEG = href.endsWith('.txt') || href.endsWith('.zip');
      
      if (isEEG) {
        console.log("🧠 Intercepted download button:", href);
        e.preventDefault();
        e.stopPropagation();
        window.postMessage({ type: "EEG_INTERCEPT", href }, "*");
        return false;
      }
    }
    element = element.parentElement;
  }
}, true); // Use capture phase

// Special handling for PhysioNet
if (window.location.hostname.includes('physionet')) {
  console.log("🏥 PhysioNet detected, adding special handlers");
  
  // Watch for dynamically created download links
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) { // Element node
          const links = node.querySelectorAll ? node.querySelectorAll('a[href$=".txt"], a[href$=".zip"]') : [];
          links.forEach(link => {
            console.log("🔍 Found dynamic EEG link:", link.href);
          });
        }
      });
    });
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}