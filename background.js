// Common state management
let adStates = {};
let originalVolumes = {};
let adTimeouts = {};
let debugEnabled = false;

// Always log that the extension is starting
console.log('[AdMute] Background script loaded at', new Date().toISOString());

// Debug logging helper for Hotstar
function logHotstarEvent(tabId, event, details = {}) {
  const timestamp = new Date().toISOString();
  // Always log important events, detailed logs only when debug enabled
  if (event.includes('Cricket Ad') || event.includes('Muting') || event.includes('Unmuting') || debugEnabled) {
    console.log(`[Hotstar ${timestamp}] Tab ${tabId}: ${event}`, {
      timestamp,
      tabId,
      event,
      ...details
    });
  }
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
  // Always log important events, detailed logs only when debug enabled
  if (event.includes('Ad Start') || event.includes('Content Resume') || debugEnabled) {
    console.log(`[SonyLIV ${timestamp}] Tab ${tabId}: ${event}`, {
      timestamp,
      tabId,
      event,
      ...details
    });
  }
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
    if (debugEnabled) console.log(`[Debug] Handling tab muting:`, { tabId, shouldMute, isCricketAd });
    const tab = await browser.tabs.get(tabId);
    if (debugEnabled) console.log(`[Debug] Current tab state:`, { muted: tab.mutedInfo.muted });
    
    if (shouldMute && !tab.mutedInfo.muted) {
      if (debugEnabled) console.log(`[Debug] Muting tab ${tabId}`);
      originalVolumes[tabId] = tab.mutedInfo.muted;
      await browser.tabs.update(tabId, { muted: true });
    } else if (!shouldMute) {  
      if (debugEnabled) console.log(`[Debug] Unmuting tab ${tabId}`);
      await browser.tabs.update(tabId, { muted: false });
      delete originalVolumes[tabId];
      if (adTimeouts[tabId]) {
        clearTimeout(adTimeouts[tabId]);
        delete adTimeouts[tabId];
      }
      // Stop countdown timer when manually unmuting
      browser.tabs.sendMessage(tabId, { action: 'stopCountdown' }).catch(() => {});
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
    
    // Log when we're monitoring supported sites
    if (debugEnabled && (domain.includes('hotstar.com') || domain.includes('sonyliv.com'))) {
      console.log('[AdMute] Monitoring request on', domain, 'URL snippet:', url.substring(0, 100));
    }
    
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

function parseCricketAdDuration(url) {
  const params = new URLSearchParams(url.split('?')[1]);
  // Try both camelCase and lowercase versions
  const adName = params.get('adName') || params.get('adname');
  
  if (debugEnabled) {
    console.log('[Debug] Parsing cricket ad duration from adName:', adName);
    console.log('[Debug] Available URL params:', Array.from(params.keys()));
  }
  
  if (adName) {
    let duration = null;
    
    // Method 1: Look for pattern like "20s" anywhere in the ad name
    const secondsMatch = adName.match(/(\d+)s/);
    if (secondsMatch) {
      duration = parseInt(secondsMatch[1]);
      if (debugEnabled) {
        console.log('[Debug] Found duration pattern "Xs":', duration, 'from', secondsMatch[0]);
      }
    }
    
    // Method 2: Look for pattern like "_20" at the end (fallback or verification)
    const underscoreMatch = adName.match(/_(\d+)$/);
    if (underscoreMatch) {
      const endDuration = parseInt(underscoreMatch[1]);
      if (debugEnabled) {
        console.log('[Debug] Found duration pattern "_X":', endDuration, 'from', underscoreMatch[0]);
      }
      
      // If both patterns exist, prefer the "Xs" pattern, but verify they match
      if (duration && duration !== endDuration) {
        if (debugEnabled) {
          console.log('[Debug] Duration mismatch! Using "Xs" pattern:', duration, 'vs "_X" pattern:', endDuration);
        }
      } else if (!duration) {
        duration = endDuration;
      }
    }
    
    // Validate duration is reasonable (10-60 seconds for typical ads)
    if (duration && duration >= 10 && duration <= 60) {
      if (debugEnabled) {
        console.log('[Debug] Final parsed duration:', duration, 'seconds');
      }
      return duration;
    } else if (duration) {
      if (debugEnabled) {
        console.log('[Debug] Duration', duration, 'is outside valid range (10-60s), ignoring');
      }
    }
  }
  
  if (debugEnabled) {
    console.log('[Debug] No valid duration found, returning null');
  }
  return null;
}

function handleHotstarRequest(url, tabId, handleTabMuting) {
  // Check for cricket video
  if (url.includes(HOTSTAR_PATTERNS.CRICKET_VIDEO)) {
    logHotstarEvent(tabId, '🏏 Cricket Video Detected', { url });
    return handleTabMuting(tabId, false);
  }
  
  // Check for cricket ad start
  if (url.includes(HOTSTAR_PATTERNS.CRICKET_AD_START)) {
    // Extract key parameters for debugging (try both camelCase and lowercase)
    const params = new URLSearchParams(url.split('?')[1]);
    const adName = params.get('adName') || params.get('adname');
    const campaignName = params.get('campaignName') || params.get('campaignname');
    const goalName = params.get('goalName') || params.get('goalname');
    const eventType = params.get('eventType') || params.get('eventtype');
    
    // Always log why this was detected as an ad
    console.log('[AdMute] 🏏 CRICKET AD DETECTED - URL contains pattern:', HOTSTAR_PATTERNS.CRICKET_AD_START);
    console.log('[AdMute] Ad Details:', {
      adName: adName,
      campaignName: campaignName,
      goalName: goalName,
      eventType: eventType,
      fullURL: url
    });
    
    const adDuration = parseCricketAdDuration(url);
    logHotstarEvent(tabId, '🏏 Cricket Ad Detection', { url, adDuration });
    
    if (debugEnabled) {
      console.log('[Debug] Cricket ad URL contains ct_impression pattern');
      console.log('[Debug] Parsed duration result:', adDuration);
    }

    if (adDuration) {
      // Always log the successful duration parsing (not just in debug mode)
      console.log('[AdMute] ✅ Successfully parsed cricket ad duration:', adDuration + 's');
      console.log('[AdMute] 🔇 Starting cricket ad mute with duration:', adDuration + 's');
      logHotstarEvent(tabId, '🔇 Muting - Cricket Ad Duration: ' + adDuration + 's', { adDuration });
      handleTabMuting(tabId, true);

      // Set timer to unmute after parsed duration
      if (adTimeouts[tabId]) {
        console.log('[AdMute] ⚠️ Clearing existing timeout for tab', tabId);
        clearTimeout(adTimeouts[tabId]);
      }
      console.log('[AdMute] ⏰ Setting timer for', adDuration + 's', 'on tab', tabId);
      adTimeouts[tabId] = setTimeout(async () => {
        console.log('[AdMute] ⏰ Timer expired! Unmuting after', adDuration + 's');
        logHotstarEvent(tabId, '🔊 Unmuting - Cricket Ad Duration Complete', { adDuration });
        await handleTabMuting(tabId, false);
        // Stop countdown timer
        browser.tabs.sendMessage(tabId, { action: 'stopCountdown' }).catch(() => {});
        delete adTimeouts[tabId];
      }, adDuration * 1000);
      
      // Start countdown timer
      browser.tabs.sendMessage(tabId, { 
        action: 'startCountdown', 
        duration: adDuration 
      }).catch(() => {});
    } else {
      // Fallback to default cricket ad duration if no duration found
      console.log('[AdMute] ⚠️ Could not parse duration, using default 30s');
      console.log('[AdMute] 🔇 Starting cricket ad mute with DEFAULT duration: 30s');
      logHotstarEvent(tabId, '🔇 Muting - Cricket Ad (default 30s)', { adDuration: 30 });
      handleTabMuting(tabId, true);
      
      if (adTimeouts[tabId]) {
        console.log('[AdMute] ⚠️ Clearing existing timeout for tab', tabId, '(fallback path)');
        clearTimeout(adTimeouts[tabId]);
      }
      console.log('[AdMute] ⏰ Setting DEFAULT timer for 30s on tab', tabId);
      adTimeouts[tabId] = setTimeout(async () => {
        console.log('[AdMute] ⏰ DEFAULT Timer expired! Unmuting after 30s');
        logHotstarEvent(tabId, '🔊 Unmuting - Cricket Ad Complete (default)', { adDuration: 30 });
        await handleTabMuting(tabId, false);
        // Stop countdown timer
        browser.tabs.sendMessage(tabId, { action: 'stopCountdown' }).catch(() => {});
        delete adTimeouts[tabId];
      }, 30000);
      
      // Start countdown timer for default duration
      browser.tabs.sendMessage(tabId, { 
        action: 'startCountdown', 
        duration: 30 
      }).catch(() => {});
    }
    return;
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
        // Stop countdown timer
        browser.tabs.sendMessage(tabId, { action: 'stopCountdown' }).catch(() => {});
        delete adTimeouts[tabId];
      }, breakInfo.adDuration * 1000);
      
      // Start countdown timer
      browser.tabs.sendMessage(tabId, { 
        action: 'startCountdown', 
        duration: breakInfo.adDuration 
      }).catch(() => {});
    }
  }

  // Check for ad completion when no duration was provided
  if (url.includes(HOTSTAR_PATTERNS.AD_COMPLETE)) {
    logHotstarEvent(tabId, '🔊 Unmuting - Ad Complete (q100)', { url });
    // Stop countdown timer
    browser.tabs.sendMessage(tabId, { action: 'stopCountdown' }).catch(() => {});
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
    if (debugEnabled) console.log(`[SonyLIV ${getISTTime()}] DRM request:`, {
      timeSinceLastPubAds: timeSinceLastPubAds + 'ms',
      adState: adStates[tabId]
    });
    
    // If we see drm request within 2 seconds of pubads request
    if (timeSinceLastPubAds < 2000 && adStates[tabId] === 'ad') {
      adStates[tabId] = 'content';
      if (debugEnabled) console.log(`[SonyLIV ${getISTTime()}] 🟢 Content Resume (pubads->drm)`);
      delete originalVolumes[tabId];
      return handleTabMuting(tabId, false);
    }
  }
  
  // Check for ad start
  const matchedAdPattern = SONYLIV_PATTERNS.AD_START.find(pattern => url.includes(pattern.toLowerCase()));
  if (matchedAdPattern && adStates[tabId] !== 'ad') {
    adStates[tabId] = 'ad';
    if (debugEnabled) console.log(`[SonyLIV ${getISTTime()}] 🔴 Ad Start`);
    return handleTabMuting(tabId, true, false);
  }
}

// Initialize debug state on startup
browser.storage.local.get(['debugEnabled']).then((result) => {
  debugEnabled = result.debugEnabled || false;
  console.log('[AdMute] Extension loaded - Debug mode:', debugEnabled ? 'enabled' : 'disabled');
  
  // Test the parsing function with user's actual ad name
  const testAdName = 'PR-25-018945_INDvENG2025_INDvsENG_ENGvINDFTG3T2DTOM20sEng_English_VCTA_20';
  const testUrl = `https://bifrost-api.hotstar.com/v1/events/track/ct_impression?adName=${testAdName}`;
  const testResult = parseCricketAdDuration(testUrl);
  console.log('[AdMute] Startup test - Parsing result for sample ad:', testResult + 's');
});

// Listen for messages from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'setDebug') {
    debugEnabled = message.enabled;
    console.log('[AdMute] Debug logging', debugEnabled ? 'enabled' : 'disabled');
  } else if (message.action === 'testAdDemo') {
    // Simulate a full ad experience
    const tabId = message.tabId;
    console.log('[AdMute] 🧪 Testing ad demo on tab', tabId);
    
    // Simulate muting the tab
    handleTabMuting(tabId, true).then(() => {
      console.log('[AdMute] 🧪 Test: Tab muted');
      
      // Start countdown timer for 10 seconds
      browser.tabs.sendMessage(tabId, { 
        action: 'startCountdown', 
        duration: 10 
      }).catch(() => {});
      
      // Set timer to unmute after 10 seconds
      setTimeout(async () => {
        console.log('[AdMute] 🧪 Test: Unmuting after 10 seconds');
        await handleTabMuting(tabId, false);
        // Stop countdown timer
        browser.tabs.sendMessage(tabId, { action: 'stopCountdown' }).catch(() => {});
      }, 10000);
    });
  }
});
