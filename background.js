import { HOTSTAR_PATTERNS, handleHotstarRequest } from './providers/hotstar.js';
import { SONYLIV_PATTERNS, handleSonyLivRequest } from './providers/sonyliv.js';

// Common state management
let adStates = {};
let originalVolumes = {};
let adTimeouts = {};

// Helper function to handle tab muting
async function handleTabMuting(tabId, shouldMute, isCricketAd = false) {
  try {
    const tab = await browser.tabs.get(tabId);
    
    if (shouldMute && !tab.mutedInfo.muted) {
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

// Main request listener
browser.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (details.tabId === -1) return;
    
    const url = details.url.toLowerCase();
    const domain = new URL(details.url).hostname;
    
    // Route to appropriate handler based on domain
    if (domain.includes('hotstar.com')) {
      return handleHotstarRequest(url, details.tabId, handleTabMuting);
    }
    
    if (domain.includes('sonyliv.com')) {
      return handleSonyLivRequest(url, details.tabId, handleTabMuting);
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
