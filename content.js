let overlay = null;

function createOverlay() {
  overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: calc(100% - 100px);
    background: rgba(0, 0, 0, 0.95);
    z-index: 2147483647;
    pointer-events: none;
    display: none;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: Arial, sans-serif;
    color: #ffffff40;
    font-size: 24px;
  `;
  
  overlay.innerHTML = '🔇 Ad Hidden';
  document.body.appendChild(overlay);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.type === 'VOLUME_ACTION') {
    if (!overlay) createOverlay();
    
    if (message.shouldMute) {
      overlay.style.display = 'flex';
    } else {
      overlay.style.display = 'none';
    }
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createOverlay);
} else {
  createOverlay();
}