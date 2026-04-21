// Content script for countdown timer and overlay
let countdownTimer = null;
let countdownInterval = null;
let adOverlay = null;

// Get next content item
async function getNextContent() {
  try {
    const content = await browser.runtime.sendMessage({ action: 'getContent' });
    if (content) {
      console.log('[AdMute] Overlay fact served:', content.source || 'unknown', content.type, content.content);
      return content;
    }
  } catch (error) {
    console.error('[AdMute] Error fetching fact from stored library:', error);
  }

  console.warn('[AdMute] No stored fact available; showing library loading state instead of a static fact');
  return null;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

// Create simple veil overlay
function createSimpleOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'admute-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.9);
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
    pointer-events: none;
  `;
  
  centerContent.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 16px;">🔇</div>
    <div style="font-size: 24px; font-weight: 600;">Ad is playing...</div>
    <div style="font-size: 16px; margin-top: 8px; opacity: 0.8;">Audio muted</div>
    <div style="font-size: 14px; margin-top: 12px; opacity: 0.6;">(Click to dismiss)</div>
  `;
  
  overlay.appendChild(centerContent);
  
  // Allow clicks to dismiss overlay
  overlay.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    hideOverlay();
  });
  
  document.body.appendChild(overlay);
  return overlay;
}

// Create educational overlay with content
async function createEducationalOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'admute-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.9);
    z-index: 9998;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
    transition: opacity 0.3s ease;
    cursor: pointer;
  `;
  
  // Get random educational content
  const contentItem = await getNextContent();
  overlay.dataset.admuteFactSource = contentItem ? contentItem.source || 'unknown' : 'no-stored-fact';
  overlay.dataset.admuteFactType = contentItem ? contentItem.type || '' : 'Fact library loading';
  overlay.dataset.admuteFactContent = contentItem ? contentItem.content || '' : '';
  
  const centerContent = document.createElement('div');
  centerContent.style.cssText = `
    max-width: 600px;
    padding: 40px;
    text-align: center;
    color: white;
    font-family: system-ui, -apple-system, sans-serif;
    pointer-events: none;
  `;
  
  const factMarkup = contentItem ? `
      <div style="
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
      ">
        <div style="
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 12px;
          color: #ffd700;
        ">${escapeHtml(contentItem.type)}</div>
        <div style="
          font-size: 16px;
          line-height: 1.5;
          font-weight: 400;
        ">${escapeHtml(contentItem.content)}</div>
      </div>
  ` : `
      <div style="
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
      ">
        <div style="
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 12px;
          color: #ffd700;
        ">Fact library loading</div>
        <div style="
          font-size: 16px;
          line-height: 1.5;
          font-weight: 400;
        ">OpenRouter facts are still being fetched. No static fact fallback is enabled.</div>
      </div>
  `;

  centerContent.innerHTML = `
    <div style="
      background: rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 32px;
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    ">
      <div style="font-size: 32px; margin-bottom: 16px;">🔇</div>
      <div style="font-size: 14px; opacity: 0.7; margin-bottom: 24px;">Ad is playing - Audio muted</div>
      ${factMarkup}
      
      <div style="font-size: 12px; opacity: 0.5;">(Click anywhere to dismiss)</div>
    </div>
  `;
  
  overlay.appendChild(centerContent);
  
  // Allow clicks to dismiss overlay
  overlay.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    hideOverlay();
  });
  
  document.body.appendChild(overlay);
  return overlay;
}

// Create overlay based on user preference
async function createAdOverlay() {
  // Remove existing overlay if any
  const existing = document.getElementById('admute-overlay');
  if (existing) {
    existing.remove();
  }

  // Get user preference
  const result = await browser.storage.local.get(['overlayMode']);
  const overlayMode = result.overlayMode || 'educational';
  
  if (overlayMode === 'simple') {
    return createSimpleOverlay();
  } else if (overlayMode === 'educational') {
    return await createEducationalOverlay();
  } else if (overlayMode === 'minimal') {
    // Don't create overlay for minimal mode
    return null;
  }
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

async function startCountdown(durationSeconds) {
  // Create timer element
  createCountdownTimer();
  
  // Create overlay based on user preference (may be null for minimal mode)
  await createAdOverlay();
  
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
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'startCountdown') {
    await startCountdown(message.duration);
  } else if (message.action === 'stopCountdown') {
    hideCountdown();
  } else if (message.action === 'showOverlay') {
    await createAdOverlay();
  } else if (message.action === 'hideOverlay') {
    hideOverlay();
  }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  hideCountdown();
  hideOverlay();
});
