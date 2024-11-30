// Constants
const HOTSTAR_PATTERNS = {
  AD_START: "bifrost-api.hotstar.com/v1/events/track/shifu_impression",
  CRICKET_AD_START: "bifrost-api.hotstar.com/v1/events/track/ct_impression",
  AD_COMPLETE: "bifrost-api.hotstar.com/v1/events/track/shifu_quartile_q100",
  CRICKET_VIDEO: "hssportsprepack.akamaized.net/videos/cricket"
};

// State management
const originalVolumes = {};
const adTimeouts = {};

// Helper functions
function parseHotstarAdBreakInfo(url) {
  const params = new URLSearchParams(url.split('?')[1]);
  return {
    adDuration: params.has('ad_duration') ? parseInt(params.get('ad_duration')) / 1000 : null
  };
}

async function handleTabMuting(tabId, shouldMute) {
  try {
    const tab = await chrome.tabs.get(tabId);
    
    if (shouldMute && !tab.mutedInfo.muted) {
      originalVolumes[tabId] = tab.mutedInfo.muted;
      await chrome.tabs.update(tabId, { muted: true });
    } else if (!shouldMute) {  
      await chrome.tabs.update(tabId, { muted: false });
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

// Request handler
function handleHotstarRequest(url, tabId) {
  if (url.includes(HOTSTAR_PATTERNS.CRICKET_VIDEO)) {
    return handleTabMuting(tabId, false);
  }
  
  if (url.includes(HOTSTAR_PATTERNS.AD_START)) {
    const breakInfo = parseHotstarAdBreakInfo(url);
    handleTabMuting(tabId, true);

    if (breakInfo.adDuration > 0) {
      if (adTimeouts[tabId]) {
        clearTimeout(adTimeouts[tabId]);
      }
      adTimeouts[tabId] = setTimeout(async () => {
        await handleTabMuting(tabId, false);
        delete adTimeouts[tabId];
      }, breakInfo.adDuration * 1000);
    }
  }

  if (url.includes(HOTSTAR_PATTERNS.AD_COMPLETE)) {
    return handleTabMuting(tabId, false);
  }
}

// Main request listener
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId === -1) return;
    
    const url = details.url.toLowerCase();
    const domain = new URL(details.url).hostname;
    
    if (domain.includes('hotstar.com')) {
      handleHotstarRequest(url, details.tabId);
    }
  },
  { urls: ["<all_urls>"] }
);

// Cleanup listeners
chrome.tabs.onRemoved.addListener((tabId) => {
  if (adTimeouts[tabId]) {
    clearTimeout(adTimeouts[tabId]);
    delete adTimeouts[tabId];
  }
  delete originalVolumes[tabId];
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
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