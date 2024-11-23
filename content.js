// Observe DOM changes to detect when ads start/end
const adObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    checkForAd();
  }
});

function checkForAd() {
  // Common ad indicators in Hotstar's player
  const adIndicators = [
    '.ad-overlay',
    '.ad-container',
    '[data-text="Advertisement"]',
    '.ad-unit'
  ];

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