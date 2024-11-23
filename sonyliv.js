// SonyLIV specific constants and patterns
export const SONYLIV_PATTERNS = {
    AD_START: [
      "adservice.google.com/ddm/fls",
      "securepubads.g.doubleclick.net/pcs/view",
      "pubads.g.doubleclick.net/pagead/interaction"
    ],
    CONTENT_RESUME: "sprite.sonyliv.com/Img"
  };
  
  // Debug logging helper
  function logSonyLivEvent(tabId, event, details = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[SonyLIV ${timestamp}] Tab ${tabId}: ${event}`, {
      timestamp,
      tabId,
      event,
      ...details
    });
  }
  
  export function handleSonyLivRequest(url, tabId, handleTabMuting) {
    // Log every request we inspect
    logSonyLivEvent(tabId, 'Inspecting Request', { 
      url,
      isAdStart: SONYLIV_PATTERNS.AD_START.some(pattern => url.includes(pattern)),
      isContentResume: url.includes(SONYLIV_PATTERNS.CONTENT_RESUME)
    });

    // Check for ad start patterns
    const matchedAdPattern = SONYLIV_PATTERNS.AD_START.find(pattern => url.includes(pattern));
    if (matchedAdPattern) {
      logSonyLivEvent(tabId, '🔴 Ad Start Detected', { 
        url,
        matchedPattern: matchedAdPattern,
        allPatterns: SONYLIV_PATTERNS.AD_START
      });
      return handleTabMuting(tabId, true, false);
    }
    
    // Check for content resume
    if (url.includes(SONYLIV_PATTERNS.CONTENT_RESUME)) {
      logSonyLivEvent(tabId, '🟢 Content Resume Detected', { 
        url,
        pattern: SONYLIV_PATTERNS.CONTENT_RESUME
      });
      return handleTabMuting(tabId, false);
    }

    // Log unmatched requests that might be interesting
    if (url.includes('ad') || url.includes('ads') || url.includes('doubleclick')) {
      logSonyLivEvent(tabId, '⚠️ Potential Ad-Related Request', { 
        url,
        matched: false,
        reason: 'Contains ad-related keywords but doesn\'t match patterns'
      });
    }
  }