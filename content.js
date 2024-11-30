let overlay = null;
let countdownInterval = null;

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
    justify-content: center;
    align-items: center;
    font-family: Arial, sans-serif;
  `;

  const message = document.createElement('div');
  message.style.cssText = `
    color: #ffffff;
    font-size: 24px;
    background: rgba(255, 255, 255, 0.1);
    padding: 20px 40px;
    border-radius: 8px;
    text-align: center;
  `;
  message.innerHTML = '🔇 Ad Hidden<br><span id="countdown"></span>';
  
  overlay.appendChild(message);
  document.body.appendChild(overlay);
}

function updateCountdown(duration) {
  if (countdownInterval) clearInterval(countdownInterval);
  
  if (!duration) return;
  
  let remaining = Math.round(duration);
  const countdownElement = document.getElementById('countdown');
  
  countdownInterval = setInterval(() => {
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      return;
    }
    countdownElement.textContent = `${remaining}s remaining`;
    remaining--;
  }, 1000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.type === 'VOLUME_ACTION') {
    if (!overlay) createOverlay();
    
    if (message.shouldMute) {
      overlay.style.display = 'flex';
      updateCountdown(message.duration);
    } else {
      overlay.style.display = 'none';
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
    }
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createOverlay);
} else {
  createOverlay();
}