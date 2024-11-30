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

function handleHotstarRequest(url, tabId) {
  if (url.includes('bifrost-api.hotstar.com/v1/events/track/shifu_impression')) {
    const breakInfo = parseHotstarAdBreakInfo(url);
    handleTabMuting(tabId, true, breakInfo.adDuration);

    if (breakInfo.adDuration) {
      setTimeout(() => handleTabMuting(tabId, false), breakInfo.adDuration * 1000);
    }
  }

  if (url.includes('bifrost-api.hotstar.com/v1/events/track/shifu_quartile_q100')) {
    handleTabMuting(tabId, false);
  }
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId === -1) return;
    
    const url = details.url.toLowerCase();
    if (url.includes('hotstar.com')) {
      handleHotstarRequest(url, details.tabId);
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    handleTabMuting(tabId, false);
  }
});