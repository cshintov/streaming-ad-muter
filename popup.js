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

    // Load settings
    const result = await browser.storage.local.get(['debugEnabled', 'overlayMode']);
    const debugToggle = document.getElementById('debugToggle');
    debugToggle.checked = result.debugEnabled || false;
    
    // Load overlay mode setting
    const overlayMode = result.overlayMode || 'educational';
    document.getElementById(`mode${overlayMode.charAt(0).toUpperCase() + overlayMode.slice(1)}`).checked = true;

    // Handle debug toggle
    debugToggle.addEventListener('change', async (e) => {
      await browser.storage.local.set({ debugEnabled: e.target.checked });
      // Notify background script of debug state change
      browser.runtime.sendMessage({ 
        action: 'setDebug', 
        enabled: e.target.checked 
      });
    });

    // Handle overlay mode changes
    document.querySelectorAll('input[name="overlayMode"]').forEach(radio => {
      radio.addEventListener('change', async (e) => {
        if (e.target.checked) {
          await browser.storage.local.set({ overlayMode: e.target.value });
          console.log('Overlay mode changed to:', e.target.value);
        }
      });
    });

    // Handle test buttons
    document.getElementById('testAdDemo').addEventListener('click', async () => {
      try {
        // Send test message to background script
        await browser.runtime.sendMessage({ 
          action: 'testAdDemo',
          tabId: currentTab.id
        });
        // Close popup after triggering test
        window.close();
      } catch (error) {
        console.error('Error triggering test:', error);
      }
    });

    document.getElementById('testOverlayOnly').addEventListener('click', async () => {
      try {
        // Send message directly to content script to show overlay
        await browser.tabs.sendMessage(currentTab.id, { 
          action: 'showOverlay'
        });
        // Close popup after triggering test
        window.close();
      } catch (error) {
        console.error('Error showing overlay:', error);
      }
    });

  } catch (error) {
    console.error('Error updating popup:', error);
  }
});