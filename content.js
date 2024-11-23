import { HOTSTAR_PATTERNS } from './providers/hotstar.js';
import { SONYLIV_PATTERNS } from './providers/sonyliv.js';

// Determine which provider we're on
const domain = window.location.hostname;
const adIndicators = domain.includes('hotstar.com') 
  ? HOTSTAR_PATTERNS.DOM_SELECTORS
  : domain.includes('sonyliv.com')
    ? SONYLIV_PATTERNS.DOM_SELECTORS
    : [];

// Observe DOM changes to detect when ads start/end
const adObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    checkForAd();
  }
});

function checkForAd() {
  const isAdPlaying = adIndicators.some(selector => 
    document.querySelector(selector) !== null
  );

  // Find the video element
  const videoElement = document.querySelector('video');
  
  if (videoElement) {
    if (isAdPlaying) {
      // Store the previous volume state
      if (!videoElement.dataset.previousVolume) {
        videoElement.dataset.previousVolume = videoElement.volume;
      }
      videoElement.muted = true;
    } else {
      // Restore previous volume
      if (videoElement.dataset.previousVolume) {
        videoElement.volume = parseFloat(videoElement.dataset.previousVolume);
        videoElement.muted = false;
        delete videoElement.dataset.previousVolume;
      }
    }
  }
}

// Start observing once the page loads
function initialize() {
  const targetNode = document.body;
  const config = { 
    childList: true, 
    subtree: true, 
    attributes: true 
  };

  adObserver.observe(targetNode, config);
  
  // Initial check
  checkForAd();
}

// Handle dynamic page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}