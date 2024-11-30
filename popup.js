document.addEventListener('DOMContentLoaded', () => {
  const blackoutToggle = document.getElementById('blackoutToggle');

  // Load saved state
  chrome.storage.sync.get(['blackoutEnabled'], (result) => {
    blackoutToggle.checked = result.blackoutEnabled !== false;
  });

  // Save state on change
  blackoutToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ blackoutEnabled: blackoutToggle.checked });
  });
});