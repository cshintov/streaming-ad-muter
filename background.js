let adTimeouts = {};
let originalVolumes = {};

const AD_PATTERNS = [
  "ad.doubleclick.net",
  "bifrost-api.hotstar.com/v1/events/track/ct_impression",
  "ads.hotstar.com",
  "/ads/",
  "adserver",
  "analytics.hotstar.com/impression"
];

// Helper function to check if URL matches ad patterns
function isAdRequest(url) {
  return AD_PATTERNS.some(pattern => url.includes(pattern));
}

// Helper function to handle tab muting
async function handleTabMuting(tabId, shouldMute) {
  try {
    const tab = await browser.tabs.get(tabId);
    
    if (shouldMute && !tab.mutedInfo.muted) {
      // Store original volume state
      originalVolumes[tabId] = tab.mutedInfo.muted;
      await browser.tabs.update(tabId, { muted: true });
      
      // Set timeout to unmute after 30 seconds (typical ad duration)
      if (adTimeouts[tabId]) {
        clearTimeout(adTimeouts[tabId]);
      }
      adTimeouts[tabId] = setTimeout(async () => {
        await browser.tabs.update(tabId, { muted: false });
        delete originalVolumes[tabId];
      }, 30000);
    } else if (!shouldMute && originalVolumes[tabId] !== undefined) {
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

// Listen for web requests
browser.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (details.tabId === -1) return; // Ignore non-tab requests
    
    const url = details.url.toLowerCase();
    if (isAdRequest(url)) {
      await handleTabMuting(details.tabId, true);
    }
  },
  { urls: ["<all_urls>"] }
);

// Listen for tab removal to clean up
browser.tabs.onRemoved.addListener((tabId) => {
  if (adTimeouts[tabId]) {
    clearTimeout(adTimeouts[tabId]);
    delete adTimeouts[tabId];
  }
  delete originalVolumes[tabId];
});

// Listen for tab updates
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && !tab.url.includes('hotstar.com')) {
    // Clean up if user navigates away from Hotstar
    if (adTimeouts[tabId]) {
      clearTimeout(adTimeouts[tabId]);
      delete adTimeouts[tabId];
    }
    if (originalVolumes[tabId]) {
      handleTabMuting(tabId, false);
    }
  }
});