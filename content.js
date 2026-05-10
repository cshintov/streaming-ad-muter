// Content script for countdown timer and overlay
let countdownTimer = null;
let countdownInterval = null;
let adOverlay = null;

// Fullscreen-aware parent: when the player goes fullscreen, only descendants
// of document.fullscreenElement render — so the overlay/timer must live there.
function getOverlayContainer() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.body;
}

function reparentAdmuteElements() {
  const container = getOverlayContainer();
  for (const id of ['admute-overlay', 'admute-countdown']) {
    const el = document.getElementById(id);
    if (el && el.parentNode !== container) {
      container.appendChild(el);
    }
  }
}

if (!window.__admuteFullscreenHookInstalled) {
  window.__admuteFullscreenHookInstalled = true;
  document.addEventListener('fullscreenchange', reparentAdmuteElements);
  document.addEventListener('webkitfullscreenchange', reparentAdmuteElements);
}

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

function el(tag, opts = {}, ...children) {
  const node = document.createElement(tag);
  if (opts.style) node.style.cssText = opts.style;
  if (opts.id) node.id = opts.id;
  if (opts.text != null) node.textContent = String(opts.text);
  for (const child of children) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
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
  
  timer.appendChild(el('span', { style: 'color: #ff6b6b;', text: '🔇' }));
  timer.appendChild(el('span', { id: 'admute-time', text: '00:00' }));
  
  getOverlayContainer().appendChild(timer);
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
  
  centerContent.appendChild(el('div', { style: 'font-size: 48px; margin-bottom: 16px;', text: '🔇' }));
  centerContent.appendChild(el('div', { style: 'font-size: 24px; font-weight: 600;', text: 'Ad is playing...' }));
  centerContent.appendChild(el('div', { style: 'font-size: 16px; margin-top: 8px; opacity: 0.8;', text: 'Audio muted' }));
  centerContent.appendChild(el('div', { style: 'font-size: 14px; margin-top: 12px; opacity: 0.6;', text: '(Click to dismiss)' }));
  
  overlay.appendChild(centerContent);
  
  // Allow clicks to dismiss overlay
  overlay.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    hideOverlay();
  });
  
  getOverlayContainer().appendChild(overlay);
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
  
  const factCardStyle = `
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  `;
  const factTitleStyle = 'font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #ffd700;';
  const factBodyStyle = 'font-size: 16px; line-height: 1.5; font-weight: 400;';

  const factCard = el('div', { style: factCardStyle },
    el('div', {
      style: factTitleStyle,
      text: contentItem ? contentItem.type : 'Fact library loading'
    }),
    el('div', {
      style: factBodyStyle,
      text: contentItem ? contentItem.content : 'OpenRouter facts are still being fetched. No static fact fallback is enabled.'
    })
  );

  const card = el('div', {
    style: `
      background: rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 32px;
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    `
  },
    el('div', { style: 'font-size: 32px; margin-bottom: 16px;', text: '🔇' }),
    el('div', { style: 'font-size: 14px; opacity: 0.7; margin-bottom: 24px;', text: 'Ad is playing - Audio muted' }),
    factCard,
    el('div', { style: 'font-size: 12px; opacity: 0.5;', text: '(Click anywhere to dismiss)' })
  );
  centerContent.appendChild(card);
  
  overlay.appendChild(centerContent);
  
  // Allow clicks to dismiss overlay
  overlay.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    hideOverlay();
  });
  
  getOverlayContainer().appendChild(overlay);
  return overlay;
}

// Create overlay based on user preference
async function createAdOverlay() {
  // If an overlay already exists (e.g. back-to-back ad starting inside the
  // settle window), keep it — recreating causes a visible flicker.
  const existing = document.getElementById('admute-overlay');
  if (existing) {
    existing.style.opacity = '1';
    return existing;
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
  // Overlay lifetime is owned by background.js (settle timer). Do not hide it
  // here — back-to-back ads need the overlay to stay continuously visible.
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
