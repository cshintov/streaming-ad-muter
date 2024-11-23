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
  } catch (error) {
    console.error('Error updating popup:', error);
  }
});