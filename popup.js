document.addEventListener('DOMContentLoaded', () => {
  const blackoutToggle = document.getElementById('blackoutToggle');
  const debugToggle = document.getElementById('debugToggle');

  // Load saved state
  chrome.storage.sync.get(['blackoutEnabled'], (result) => {
    blackoutToggle.checked = result.blackoutEnabled !== false;
  });

  // Save state on change
  blackoutToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ blackoutEnabled: blackoutToggle.checked });
  });

  // Load initial state
  chrome.storage.local.get(['debug'], (result) => {
    debugToggle.checked = result.debug || false;
  });

  // Handle toggle changes
  debugToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.runtime.sendMessage(
      { type: 'TOGGLE_DEBUG', enabled },
      (response) => {
        debugToggle.checked = response.debug;
      }
    );
  });
});