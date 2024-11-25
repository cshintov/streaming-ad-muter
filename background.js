// Common state management
let adStates = {};
let originalVolumes = {};
let adTimeouts = {};

// Debug logging helper for Hotstar
function logHotstarEvent(tabId, event, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[Hotstar ${timestamp}] Tab ${tabId}: ${event}`, {
    timestamp,
    tabId,
    event,
    ...details
  });
}

// Debug logging helper for SonyLIV
function getISTTime() {
  return new Date().toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function logSonyLivEvent(tabId, event, details = {}) {
  const timestamp = getISTTime();
  console.log(`[SonyLIV ${timestamp}] Tab ${tabId}: ${event}`, {
    timestamp,
    tabId,
    event,
    ...details
  });
}

// Constants
const HOTSTAR_PATTERNS = {
  AD_START: "bifrost-api.hotstar.com/v1/events/track/shifu_inventory",
  CRICKET_AD_START: "bifrost-api.hotstar.com/v1/events/track/ct_impression",
  AD_COMPLETE: "bifrost-api.hotstar.com/v1/events/track/shifu_quartile_q100"
};

const SONYLIV_PATTERNS = {
  AD_START: [
    "adservice.google.com/ddm/fls",
    "securepubads.g.doubleclick.net/pcs/view",
    "pubads.g.doubleclick.net/pagead/interaction"
  ],
  CONTENT_RESUME: "drm.sonyliv.com"
};

// Helper functions
async function handleTabMuting(tabId, shouldMute, isCricketAd = false) {
  try {
    console.log(`[Debug] Handling tab muting:`, { tabId, shouldMute, isCricketAd });
    const tab = await browser.tabs.get(tabId);
    console.log(`[Debug] Current tab state:`, { muted: tab.mutedInfo.muted });
    
    if (shouldMute && !tab.mutedInfo.muted) {
      console.log(`[Debug] Muting tab ${tabId}`);
      originalVolumes[tabId] = tab.mutedInfo.muted;
      await browser.tabs.update(tabId, { muted: true });
      
      if (isCricketAd) {
        if (adTimeouts[tabId]) {
          clearTimeout(adTimeouts[tabId]);
        }
        adTimeouts[tabId] = setTimeout(async () => {
          await browser.tabs.update(tabId, { muted: false });
          delete originalVolumes[tabId];
          delete adTimeouts[tabId];
        }, 30000);
      }
    } else if (!shouldMute) {  
      console.log(`[Debug] Unmuting tab ${tabId}`);
      await browser.tabs.update(tabId, { muted: false });
      delete originalVolumes[tabId];
      if (adTimeouts[tabId]) {
        clearTimeout(adTimeouts[tabId]);
        delete adTimeouts[tabId];
      }
    }
  } catch (error) {
    console.error('Error handling tab muting:', error);
  }
}

// Main request listener
browser.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (details.tabId === -1) return;
    
    const url = details.url.toLowerCase();
    const domain = new URL(details.url).hostname;
    
    // Check if this is a SonyLIV tab first
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    const currentTab = tabs.find(tab => tab.id === details.tabId);
    const isSonyLivTab = currentTab && new URL(currentTab.url).hostname.includes('sonyliv.com');
    
    // Handle SonyLIV ad detection for any domain if we're on a SonyLIV tab
    if (isSonyLivTab) {
      return handleSonyLivRequest(url, details.tabId, handleTabMuting);
    }
    
    // Handle Hotstar normally
    if (domain.includes('hotstar.com')) {
      return handleHotstarRequest(url, details.tabId, handleTabMuting);
    }
  },
  { urls: ["<all_urls>"] }
);

// Cleanup listeners
browser.tabs.onRemoved.addListener((tabId) => {
  if (adTimeouts[tabId]) {
    clearTimeout(adTimeouts[tabId]);
    delete adTimeouts[tabId];
  }
  delete originalVolumes[tabId];
  delete adStates[tabId];
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    if (adTimeouts[tabId]) {
      clearTimeout(adTimeouts[tabId]);
      delete adTimeouts[tabId];
    }
    if (originalVolumes[tabId]) {
      handleTabMuting(tabId, false);
    }
  }
});

function parseHotstarAdBreakInfo(url) {
  const params = new URLSearchParams(url.split('?')[1]);
  const breakInfo = {
    breakNo: parseInt(params.get('break_no')) || 0,
    slotCount: parseInt(params.get('break_slot_count')) || 0,
    slotsFilled: parseInt(params.get('break_slot_filled')) || 0,
    totalBreaks: parseInt(params.get('break_total')) || 0
  };
  
  logHotstarEvent('Ad Break Info Parsed', { url, breakInfo });
  return breakInfo;
}

function handleHotstarRequest(url, tabId, handleTabMuting) {
  // Log every request we inspect
  logHotstarEvent(tabId, 'Inspecting Request', { 
    url,
    isCricketAd: url.includes(HOTSTAR_PATTERNS.CRICKET_AD_START),
    isRegularAd: url.includes(HOTSTAR_PATTERNS.AD_START),
    isAdComplete: url.includes(HOTSTAR_PATTERNS.AD_COMPLETE)
  });

  // Check for cricket ad
  if (url.includes(HOTSTAR_PATTERNS.CRICKET_AD_START)) {
    logHotstarEvent(tabId, '🏏 Cricket Ad Start Detected', { 
      url,
      pattern: HOTSTAR_PATTERNS.CRICKET_AD_START,
      timeout: '30s'
    });
    return handleTabMuting(tabId, true, true);
  }
  
  // Check for regular ad start
  if (url.includes(HOTSTAR_PATTERNS.AD_START)) {
    const breakInfo = parseHotstarAdBreakInfo(url);
    logHotstarEvent(tabId, '🔴 Regular Ad Start Detected', { 
      url,
      pattern: HOTSTAR_PATTERNS.AD_START,
      breakInfo
    });
    return handleTabMuting(tabId, true, false, breakInfo);
  }
  
  // Check for ad completion
  if (url.includes(HOTSTAR_PATTERNS.AD_COMPLETE)) {
    logHotstarEvent(tabId, '🟢 Ad Complete Detected', { 
      url,
      pattern: HOTSTAR_PATTERNS.AD_COMPLETE
    });
    return handleTabMuting(tabId, false);
  }

  // Log unmatched requests that might be interesting
  if (url.includes('bifrost') || url.includes('track')) {
    logHotstarEvent(tabId, '⚠️ Potential Ad-Related Request', { 
      url,
      matched: false,
      reason: 'Contains Hotstar tracking keywords but doesn\'t match patterns'
    });
  }
}

// Track last pubads request time per tab
const lastPubAdsTime = {};

function handleSonyLivRequest(url, tabId, handleTabMuting) {
  // Track pubads.g requests
  if (url.includes('pubads.g.doubleclick.net')) {
    lastPubAdsTime[tabId] = Date.now();
    return;
  }
  
  // Check for drm request following a recent pubads request
  if (url.includes(SONYLIV_PATTERNS.CONTENT_RESUME)) {
    const timeSinceLastPubAds = Date.now() - (lastPubAdsTime[tabId] || 0);
    console.log(`[SonyLIV ${getISTTime()}] DRM request:`, {
      timeSinceLastPubAds: timeSinceLastPubAds + 'ms',
      adState: adStates[tabId]
    });
    
    // If we see drm request within 2 seconds of pubads request
    if (timeSinceLastPubAds < 2000 && adStates[tabId] === 'ad') {
      adStates[tabId] = 'content';
      console.log(`[SonyLIV ${getISTTime()}] 🟢 Content Resume (pubads->drm)`);
      delete originalVolumes[tabId];
      return handleTabMuting(tabId, false);
    }
  }
  
  // Check for ad start
  const matchedAdPattern = SONYLIV_PATTERNS.AD_START.find(pattern => url.includes(pattern.toLowerCase()));
  if (matchedAdPattern && adStates[tabId] !== 'ad') {
    adStates[tabId] = 'ad';
    console.log(`[SonyLIV ${getISTTime()}] 🔴 Ad Start`);
    return handleTabMuting(tabId, true, false);
  }
}
