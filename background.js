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
  AD_START: "bifrost-api.hotstar.com/v1/events/track/shifu_impression",
  CRICKET_AD_START: "bifrost-api.hotstar.com/v1/events/track/ct_impression",
  AD_COMPLETE: "bifrost-api.hotstar.com/v1/events/track/shifu_quartile_q100",
  CRICKET_VIDEO: "hssportsprepack.akamaized.net/videos/cricket"
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
  const hasAdDuration = params.has('ad_duration');
  return {
    adDuration: hasAdDuration ? parseInt(params.get('ad_duration')) / 1000 : null, // Convert to seconds
    contentType: params.get('content_type') || ''
  };
}

function handleHotstarRequest(url, tabId, handleTabMuting) {
  // Check for cricket video
  if (url.includes(HOTSTAR_PATTERNS.CRICKET_VIDEO)) {
    logHotstarEvent(tabId, '🏏 Cricket Video Detected', { url });
    return handleTabMuting(tabId, false);
  }
  
  // Check for regular ad start
  if (url.includes(HOTSTAR_PATTERNS.AD_START)) {
    const breakInfo = parseHotstarAdBreakInfo(url);
    logHotstarEvent(tabId, '🔴 Ad Detection', { url, breakInfo });

    if (breakInfo.adDuration === null) {
      logHotstarEvent(tabId, '🔇 Muting - No Ad Duration Parameter (will unmute on q100)', { breakInfo });
      return handleTabMuting(tabId, true);
    }

    if (breakInfo.adDuration > 0) {
      logHotstarEvent(tabId, '🔇 Muting - Ad Duration: ' + breakInfo.adDuration + 's', { breakInfo });
      handleTabMuting(tabId, true);

      // Set timer to unmute after duration
      if (adTimeouts[tabId]) {
        clearTimeout(adTimeouts[tabId]);
      }
      adTimeouts[tabId] = setTimeout(async () => {
        logHotstarEvent(tabId, '🔊 Unmuting - Ad Duration Complete', { breakInfo });
        await handleTabMuting(tabId, false);
        delete adTimeouts[tabId];
      }, breakInfo.adDuration * 1000);
    }
  }

  // Check for ad completion when no duration was provided
  if (url.includes(HOTSTAR_PATTERNS.AD_COMPLETE)) {
    logHotstarEvent(tabId, '🔊 Unmuting - Ad Complete (q100)', { url });
    return handleTabMuting(tabId, false);
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
