// Popup script to show current status
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    
    if (currentTab.url.includes('hotstar.com')) {
      document.querySelector('.status p').textContent = 
        currentTab.mutedInfo.muted ? 
        'Ad detected - Tab is currently muted' : 
        'Monitoring for ads - Tab is not muted';
    } else {
      document.querySelector('.status').innerHTML = `
        <h3 style="color: #666;">Not on Hotstar</h3>
        <p>Extension only works on hotstar.com</p>
      `;
    }

    // Load debug setting
    const result = await browser.storage.local.get(['debugEnabled']);
    const debugToggle = document.getElementById('debugToggle');
    debugToggle.checked = result.debugEnabled || false;

    // Handle debug toggle
    debugToggle.addEventListener('change', async (e) => {
      await browser.storage.local.set({ debugEnabled: e.target.checked });
      // Notify background script of debug state change
      browser.runtime.sendMessage({ 
        action: 'setDebug', 
        enabled: e.target.checked 
      });
    });

  } catch (error) {
    console.error('Error updating popup:', error);
  }
});