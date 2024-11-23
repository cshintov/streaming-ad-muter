let adTimeouts = {};
let originalVolumes = {};
let adStates = {};

const AD_PATTERNS = [
  "ad.doubleclick.net",
  "ads.hotstar.com",
  "/ads/",
  "adserver",
  "analytics.hotstar.com/impression"
];

const CRICKET_AD_START = "bifrost-api.hotstar.com/v1/events/track/ct_impression";
const REGULAR_AD_START = "bifrost-api.hotstar.com/v1/events/track/shifu_inventory";
const AD_COMPLETE = "bifrost-api.hotstar.com/v1/events/track/shifu_quartile_q100";

// Helper function to check if URL matches ad patterns
function isAdRequest(url) {
  return AD_PATTERNS.some(pattern => url.includes(pattern));
}

// Add logging helper
function logAdEvent(tabId, event, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Tab ${tabId}: ${event}`, {
    adStates: adStates[tabId],
    ...details
  });
}

// Helper function to handle tab muting
async function handleTabMuting(tabId, shouldMute, isCricketAd = false) {
  try {
    const tab = await browser.tabs.get(tabId);
    
    // Initialize ad state for this tab if doesn't exist
    if (!adStates[tabId]) {
      adStates[tabId] = {
        isCurrentlyMuted: false,
        pendingUnmute: false,
        adCount: 0
      };
    }

    if (shouldMute && !tab.mutedInfo.muted) {
      adStates[tabId].adCount++;
      adStates[tabId].isCurrentlyMuted = true;
      
      logAdEvent(tabId, 'Muting tab', {
        isCricketAd,
        adCount: adStates[tabId].adCount
      });

      originalVolumes[tabId] = tab.mutedInfo.muted;
      await browser.tabs.update(tabId, { muted: true });
      
      if (isCricketAd) {
        if (adTimeouts[tabId]) {
          clearTimeout(adTimeouts[tabId]);
        }
        adTimeouts[tabId] = setTimeout(async () => {
          logAdEvent(tabId, 'Cricket ad timeout completed');
          await browser.tabs.update(tabId, { muted: false });
          delete originalVolumes[tabId];
          delete adTimeouts[tabId];
          delete adStates[tabId];
        }, 30000);
      }
    } else if (!shouldMute && originalVolumes[tabId] !== undefined) {
      // Add a small delay before unmuting to handle race conditions
      adStates[tabId].pendingUnmute = true;
      
      logAdEvent(tabId, 'Scheduling unmute', {
        currentState: adStates[tabId]
      });

      setTimeout(async () => {
        // Check if we received another mute command during the delay
        if (adStates[tabId]?.pendingUnmute) {
          logAdEvent(tabId, 'Executing unmute');
          await browser.tabs.update(tabId, { muted: false });
          delete originalVolumes[tabId];
          if (adTimeouts[tabId]) {
            clearTimeout(adTimeouts[tabId]);
            delete adTimeouts[tabId];
          }
          delete adStates[tabId];
        } else {
          logAdEvent(tabId, 'Unmute cancelled - new ad detected');
        }
      }, 500); // 500ms delay
    }
  } catch (error) {
    console.error('Error handling tab muting:', error);
    logAdEvent(tabId, 'Error', { error: error.message });
  }
}

// Helper to parse ad break info from URL
function parseAdBreakInfo(url) {
  const params = new URLSearchParams(url.split('?')[1]);
  return {
    breakNo: parseInt(params.get('break_no')) || 0,
    slotCount: parseInt(params.get('break_slot_count')) || 0,
    slotsFilled: parseInt(params.get('break_slot_filled')) || 0,
    totalBreaks: parseInt(params.get('break_total')) || 0
  };
}

// Listen for web requests
browser.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (details.tabId === -1) return; // Ignore non-tab requests
    
    const url = details.url.toLowerCase();
    
    // Handle cricket match ads
    if (url.includes(CRICKET_AD_START)) {
      logAdEvent(details.tabId, 'Cricket ad detected', { url });
      await handleTabMuting(details.tabId, true, true);
      return;
    }
    
    // Handle regular content ads
    if (url.includes(REGULAR_AD_START)) {
      const breakInfo = parseAdBreakInfo(url);
      
      // Initialize or update ad state
      if (!adStates[details.tabId]) {
        adStates[details.tabId] = {
          isCurrentlyMuted: false,
          pendingUnmute: false,
          currentBreak: breakInfo.breakNo,
          expectedAds: breakInfo.slotsFilled,
          completedAds: 0
        };
      }

      logAdEvent(details.tabId, 'Regular ad break detected', { 
        breakInfo,
        currentState: adStates[details.tabId]
      });

      await handleTabMuting(details.tabId, true, false);
      return;
    }
    
    // Handle ad completion for regular content
    if (url.includes(AD_COMPLETE)) {
      if (adStates[details.tabId]) {
        adStates[details.tabId].completedAds++;
        
        logAdEvent(details.tabId, 'Ad complete detected', {
          completedAds: adStates[details.tabId].completedAds,
          expectedAds: adStates[details.tabId].expectedAds
        });

        // Only unmute if we've completed all ads in the break
        if (adStates[details.tabId].completedAds >= adStates[details.tabId].expectedAds) {
          await handleTabMuting(details.tabId, false);
        }
      }
      return;
    }
  },
  { urls: ["<all_urls>"] }
);

// Listen for tab removal to clean up
browser.tabs.onRemoved.addListener((tabId) => {
  logAdEvent(tabId, 'Tab removed');
  if (adTimeouts[tabId]) {
    clearTimeout(adTimeouts[tabId]);
    delete adTimeouts[tabId];
  }
  delete originalVolumes[tabId];
  delete adStates[tabId];
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
