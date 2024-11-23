// Hotstar specific constants and patterns
export const HOTSTAR_PATTERNS = {
    AD_START: "bifrost-api.hotstar.com/v1/events/track/shifu_inventory",
    CRICKET_AD_START: "bifrost-api.hotstar.com/v1/events/track/ct_impression",
    AD_COMPLETE: "bifrost-api.hotstar.com/v1/events/track/shifu_quartile_q100",
    DOM_SELECTORS: [
      '.ad-overlay',
      '.ad-container',
      '[data-text="Advertisement"]',
      '.ad-unit'
    ]
  };
  
  export function parseHotstarAdBreakInfo(url) {
    const params = new URLSearchParams(url.split('?')[1]);
    return {
      breakNo: parseInt(params.get('break_no')) || 0,
      slotCount: parseInt(params.get('break_slot_count')) || 0,
      slotsFilled: parseInt(params.get('break_slot_filled')) || 0,
      totalBreaks: parseInt(params.get('break_total')) || 0
    };
  }
  
  export function handleHotstarRequest(url, tabId, handleTabMuting) {
    if (url.includes(HOTSTAR_PATTERNS.CRICKET_AD_START)) {
      return handleTabMuting(tabId, true, true); // Cricket ad - 30s timeout
    }
    
    if (url.includes(HOTSTAR_PATTERNS.AD_START)) {
      const breakInfo = parseHotstarAdBreakInfo(url);
      return handleTabMuting(tabId, true, false, breakInfo);
    }
    
    if (url.includes(HOTSTAR_PATTERNS.AD_COMPLETE)) {
      return handleTabMuting(tabId, false);
    }
  }