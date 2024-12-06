let DEBUG = false;

function logAdEvent(message, data = {}) {
  if (!DEBUG) return;
  const timestamp = new Date().toISOString().split('T')[1]; // Get time portion only
  console.log(`[HotstarAdBlock ${timestamp}] ${message}`, data);
}

// Add debug state logging when extension starts
logAdEvent('Extension initialized', {
  debug: DEBUG,
  version: chrome.runtime.getManifest().version
});

chrome.storage.local.get(['debug'], (result) => {
  DEBUG = result.debug || false;
  logAdEvent('Debug state loaded', { debug: DEBUG });
});

// Add a listener for debug toggle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE_DEBUG') {
    DEBUG = message.enabled;
    chrome.storage.local.set({ debug: DEBUG });
    logAdEvent('Debug state changed', { debug: DEBUG });
    sendResponse({ debug: DEBUG });
  }
});

async function handleBlackout(tabId, shouldShow, duration = null) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'VOLUME_ACTION',
      shouldMute: shouldShow,
      duration
    });
  } catch (error) {
    console.error('Error handling blackout:', error);
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    await chrome.tabs.sendMessage(tabId, {
      type: 'VOLUME_ACTION',
      shouldMute: shouldShow,
      duration
    });
  }
}

async function handleTabMuting(tabId, shouldMute, duration = null) {
  try {
    const tab = await chrome.tabs.get(tabId);
    logAdEvent('Muting state change requested', {
      tabId,
      shouldMute,
      duration,
      currentlyMuted: tab.mutedInfo?.muted,
      url: tab.url
    });

    // Only mute if tab URL contains hotstar.com
    if (!tab.url || !tab.url.includes('hotstar.com')) {
      return;
    }
    
    if (shouldMute && !tab.mutedInfo.muted) {
      await chrome.tabs.update(tabId, { muted: true });
      await handleBlackout(tabId, true, duration);
    } else if (!shouldMute) {
      await chrome.tabs.update(tabId, { muted: false });
      await handleBlackout(tabId, false);
    }
  } catch (error) {
    console.error('Error handling muting:', error);
  }
}

function parseHotstarAdBreakInfo(url) {
  const params = new URLSearchParams(url.split('?')[1]);
  return {
    adDuration: params.has('ad_duration') ? parseInt(params.get('ad_duration')) / 1000 : null
  };
}

let isInAdBreak = false;
let isCricketAdBreak = false;

function handleHotstarRequest(url, tabId) {
  // Cricket stream ad detection
  if (url.includes('bifrost-api.hotstar.com/v1/events/track/ct_impression')) {
    logAdEvent('Cricket ad break detected', { tabId, url });
    isCricketAdBreak = true;
    handleTabMuting(tabId, true, 30);
    return;
  }
  
  if (url.includes('hssportsprepack.akamaized.net/videos/cricket')) {
    logAdEvent('Cricket content URL detected', { 
      tabId, 
      url,
      wasInAdBreak: isCricketAdBreak 
    });
    
    if (isCricketAdBreak) {
      logAdEvent('Cricket content resumed - ending ad break');
      isCricketAdBreak = false;
      handleTabMuting(tabId, false);
    }
    return;
  }

  // Add logging to track state changes
  if (isCricketAdBreak) {
    logAdEvent('Request during cricket ad break', {
      tabId,
      url: url.substring(0, 100) + '...' // Truncate long URLs
    });
  }

  // Regular stream ad detection  
  if (url.includes('bifrost-api.hotstar.com/v1/events/track/shifu_impression')) {
    console.log('Regular ad break started');
    isInAdBreak = true;
    const breakInfo = parseHotstarAdBreakInfo(url);
    handleTabMuting(tabId, true, breakInfo.adDuration);
    return;
  }

  if (url.includes('bifrost-api.hotstar.com/v1/events/track/shifu_quartile_q100')) {
    console.log('Regular ad break ended');
    isInAdBreak = false;
    handleTabMuting(tabId, false);
    return;
  }

  // Backup detection during ad breaks
  if (isInAdBreak && url.includes('hesads')) {
    console.log('Ad content confirmed via hesads');
    handleTabMuting(tabId, true);
  }
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId === -1) return;
    const url = details.url.toLowerCase();
    if (url.includes('hotstar.com') || url.includes('akamaized.net')) {
      handleHotstarRequest(url, details.tabId);
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    isInAdBreak = false;
    isCricketAdBreak = false;
    handleTabMuting(tabId, false);
  }
});
