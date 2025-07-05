// Content script for countdown timer
let countdownTimer = null;
let countdownInterval = null;

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
}

function startCountdown(durationSeconds) {
  // Create timer element
  createCountdownTimer();
  
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
  }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  hideCountdown();
});