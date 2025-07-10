// Content script for countdown timer and overlay
let countdownTimer = null;
let countdownInterval = null;
let adOverlay = null;
let contentCache = [];
let currentContentIndex = 0;

// Static content for offline/fallback
const staticContent = [
  { type: "💡 Did you know", content: "Honey never spoils. Archaeologists have found edible honey in ancient Egyptian tombs!" },
  { type: "🧠 Quick Tip", content: "Press Ctrl+Shift+T to reopen the last closed browser tab." },
  { type: "📚 Fun Fact", content: "Octopuses have three hearts and blue blood!" },
  { type: "✨ Inspiration", content: "The only impossible journey is the one you never begin. - Tony Robbins" },
  { type: "🔢 Number Trivia", content: "The number 4 is the only number with the same number of letters as its value." },
  { type: "🧠 Quick Tip", content: "Double-click a word to select it instantly in most text editors." },
  { type: "💡 Did you know", content: "A group of flamingos is called a 'flamboyance'!" },
  { type: "📚 Fun Fact", content: "Bananas are berries, but strawberries aren't!" },
  { type: "✨ Inspiration", content: "Success is not final, failure is not fatal: it is the courage to continue that counts. - Winston Churchill" },
  { type: "🧠 Quick Tip", content: "Use Ctrl+L to quickly select the address bar in your browser." }
];

// Fetch content from APIs
async function fetchRandomContent() {
  const contentSources = [
    {
      url: 'https://asli-fun-fact-api.herokuapp.com/',
      type: '📚 Fun Fact',
      parser: (data) => data.data
    },
    {
      url: 'http://numbersapi.com/random?json',
      type: '🔢 Number Trivia', 
      parser: (data) => data.text
    }
  ];

  try {
    const randomSource = contentSources[Math.floor(Math.random() * contentSources.length)];
    const response = await fetch(randomSource.url);
    const data = await response.json();
    return {
      type: randomSource.type,
      content: randomSource.parser(data)
    };
  } catch (error) {
    // Fallback to static content if API fails
    return staticContent[Math.floor(Math.random() * staticContent.length)];
  }
}

// Get next content item
async function getNextContent() {
  // Mix API content with static content
  if (Math.random() < 0.9) { // 90% chance for API content
    return await fetchRandomContent();
  } else { // 10% chance for static content
    return staticContent[Math.floor(Math.random() * staticContent.length)];
  }
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
  
  const centerContent = document.createElement('div');
  centerContent.style.cssText = `
    max-width: 600px;
    padding: 40px;
    text-align: center;
    color: white;
    font-family: system-ui, -apple-system, sans-serif;
    pointer-events: none;
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
        ">${contentItem.type}</div>
        <div style="
          font-size: 16px;
          line-height: 1.5;
          font-weight: 400;
        ">${contentItem.content}</div>
      </div>
      
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
