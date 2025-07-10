// Content script for countdown timer and overlay
let countdownTimer = null;
let countdownInterval = null;
let adOverlay = null;

// Create and inject countdown timer element
function createCountdownTimer() {
  // Remove existing timer if any
  const existing = document.getElementById('admute-countdown');
  if (existing) {
    existing.remove();
  }

  const timer = document.createElement('div');
  timer.id = 'admute-countdown';
  timer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.8);
    color: #fff;
    padding: 8px 12px;
    border-radius: 6px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    font-weight: 600;
    z-index: 9999;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    gap: 8px;
    transition: opacity 0.3s ease;
  `;
  
  timer.innerHTML = `
    <span style="color: #ff6b6b;">🔇</span>
    <span id="admute-time">00:00</span>
  `;
  
  document.body.appendChild(timer);
  return timer;
}

function updateCountdown(seconds) {
  const timer = document.getElementById('admute-countdown');
  if (!timer) return;
  
  const timeElement = timer.querySelector('#admute-time');
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  timeElement.textContent = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Create and inject black overlay
function createAdOverlay() {
  // Remove existing overlay if any
  const existing = document.getElementById('admute-overlay');
  if (existing) {
    existing.remove();
  }

  const overlay = document.createElement('div');
  overlay.id = 'admute-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0.9, 0.9, 0.9);
    z-index: 9998;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
    transition: opacity 0.3s ease;
    cursor: pointer;
  `;
  
  const centerContent = document.createElement('div');
  centerContent.style.cssText = `
    text-align: center;
    color: white;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 24px;
    font-weight: 600;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    pointer-events: none;
  `;
  
  centerContent.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 16px;">🔇</div>
    <div>Ad is playing...</div>
    <div style="font-size: 16px; margin-top: 8px; opacity: 0.8;">Audio muted</div>
    <div style="font-size: 14px; margin-top: 12px; opacity: 0.6;">(Click to dismiss)</div>
  `;
  
  overlay.appendChild(centerContent);
  
  // Allow clicks to dismiss overlay (for test mode)
  overlay.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    hideOverlay();
  });
  
  document.body.appendChild(overlay);
  return overlay;
}

function hideOverlay() {
  const overlay = document.getElementById('admute-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
    }, 300);
  }
}

function hideCountdown() {
  const timer = document.getElementById('admute-countdown');
  if (timer) {
    timer.style.opacity = '0';
    setTimeout(() => {
      timer.remove();
    }, 300);
  }
  
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  
  // Also hide overlay when countdown ends
  hideOverlay();
}

function startCountdown(durationSeconds) {
  // Create timer element and overlay
  createCountdownTimer();
  createAdOverlay();
  
  let remainingSeconds = durationSeconds;
  updateCountdown(remainingSeconds);
  
  // Clear any existing interval
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  
  // Start countdown
  countdownInterval = setInterval(() => {
    remainingSeconds--;
    updateCountdown(remainingSeconds);
    
    if (remainingSeconds <= 0) {
      hideCountdown();
    }
  }, 1000);
}

// Listen for messages from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startCountdown') {
    startCountdown(message.duration);
  } else if (message.action === 'stopCountdown') {
    hideCountdown();
  } else if (message.action === 'showOverlay') {
    createAdOverlay();
  } else if (message.action === 'hideOverlay') {
    hideOverlay();
  }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  hideCountdown();
  hideOverlay();
});
