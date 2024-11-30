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

function handleHotstarRequest(url, tabId) {
  // Primary control through shifu events
  if (url.includes('bifrost-api.hotstar.com/v1/events/track/shifu_impression')) {
    console.log('Ad break started via shifu');
    isInAdBreak = true;
    const breakInfo = parseHotstarAdBreakInfo(url);
    handleTabMuting(tabId, true, breakInfo.adDuration);
    return;
  }

  if (url.includes('bifrost-api.hotstar.com/v1/events/track/shifu_quartile_q100')) {
    console.log('Ad break ended via shifu');
    isInAdBreak = false;
    handleTabMuting(tabId, false);
    return;
  }

  // Only use URL patterns during confirmed ad breaks
  if (isInAdBreak) {
    if (url.includes('hesads')) {
      console.log('Ad content detected via hesads');
      handleTabMuting(tabId, true);
    } else if (url.includes('hses') || url.includes('hssports')) {
      // Don't unmute if we see hses during ad break
      console.log('Ignoring regular content during ad break');
    }
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

// Reset ad break state when navigating away
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    isInAdBreak = false;
    handleTabMuting(tabId, false);
  }
});