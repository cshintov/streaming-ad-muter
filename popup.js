document.addEventListener('DOMContentLoaded', function() {
  console.log('[POPUP] DOMContentLoaded');
  
  // Load saved preference
  chrome.storage.sync.get(['blackoutEnabled'], function(result) {
    console.log('[POPUP] Loaded blackout preference:', result.blackoutEnabled);
    document.getElementById('blackoutToggle').checked = result.blackoutEnabled || false;
  });

  // Save preference when changed
  document.getElementById('blackoutToggle').addEventListener('change', function(e) {
    const isEnabled = e.target.checked;
    console.log('[POPUP] Blackout toggle changed to:', isEnabled);
    chrome.storage.sync.set({ blackoutEnabled: isEnabled }, () => {
      console.log('[POPUP] Saved blackout preference:', isEnabled);
    });
  });
});