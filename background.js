// Common state management
let adStates = {};
let originalVolumes = {};
let adTimeouts = {};
let debugEnabled = false;

// Always log that the extension is starting
console.log('[AdMute] Background script loaded at', new Date().toISOString());

// Debug logging helper for Hotstar
function logHotstarEvent(tabId, event, details = {}) {
  const timestamp = new Date().toISOString();
  // Always log important events, detailed logs only when debug enabled
  if (event.includes('Cricket Ad') || event.includes('Muting') || event.includes('Unmuting') || debugEnabled) {
    console.log(`[Hotstar ${timestamp}] Tab ${tabId}: ${event}`, {
      timestamp,
      tabId,
      event,
      ...details
    });
  }
}

// Debug logging helper for SonyLIV
function getISTTime() {
  return new Date().toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function logSonyLivEvent(tabId, event, details = {}) {
  const timestamp = getISTTime();
  // Always log important events, detailed logs only when debug enabled
  if (event.includes('Ad Start') || event.includes('Content Resume') || debugEnabled) {
    console.log(`[SonyLIV ${timestamp}] Tab ${tabId}: ${event}`, {
      timestamp,
      tabId,
      event,
      ...details
    });
  }
}

// Constants
const HOTSTAR_PATTERNS = {
  AD_START: "bifrost-api.hotstar.com/v1/events/track/shifu_impression",
  CRICKET_AD_START: "bifrost-api.hotstar.com/v1/events/track/ct_impression",
  AD_COMPLETE: "bifrost-api.hotstar.com/v1/events/track/shifu_quartile_q100",
  CRICKET_VIDEO: "hssportsprepack.akamaized.net/videos/cricket"
};

const SONYLIV_PATTERNS = {
  AD_START: [
    "adservice.google.com/ddm/fls",
    "securepubads.g.doubleclick.net/pcs/view",
    "pubads.g.doubleclick.net/pagead/interaction"
  ],
  CONTENT_RESUME: "drm.sonyliv.com"
};

// Helper functions
async function handleTabMuting(tabId, shouldMute, isCricketAd = false) {
  try {
    if (debugEnabled) console.log(`[Debug] Handling tab muting:`, { tabId, shouldMute, isCricketAd });
    const tab = await browser.tabs.get(tabId);
    if (debugEnabled) console.log(`[Debug] Current tab state:`, { muted: tab.mutedInfo.muted });
    
    if (shouldMute && !tab.mutedInfo.muted) {
      if (debugEnabled) console.log(`[Debug] Muting tab ${tabId}`);
      originalVolumes[tabId] = tab.mutedInfo.muted;
      await browser.tabs.update(tabId, { muted: true });
    } else if (!shouldMute) {  
      if (debugEnabled) console.log(`[Debug] Unmuting tab ${tabId}`);
      await browser.tabs.update(tabId, { muted: false });
      delete originalVolumes[tabId];
      if (adTimeouts[tabId]) {
        clearTimeout(adTimeouts[tabId]);
        delete adTimeouts[tabId];
      }
      // Stop countdown timer when manually unmuting
      browser.tabs.sendMessage(tabId, { action: 'stopCountdown' }).catch(() => {});
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
    
    // Log when we're monitoring supported sites
    if (debugEnabled && (domain.includes('hotstar.com') || domain.includes('sonyliv.com'))) {
      console.log('[AdMute] Monitoring request on', domain, 'URL snippet:', url.substring(0, 100));
    }
    
    // Check if this is a SonyLIV tab first
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    const currentTab = tabs.find(tab => tab.id === details.tabId);
    const isSonyLivTab = currentTab && new URL(currentTab.url).hostname.includes('sonyliv.com');
    
    // Handle SonyLIV ad detection for any domain if we're on a SonyLIV tab
    if (isSonyLivTab) {
      return handleSonyLivRequest(url, details.tabId, handleTabMuting);
    }
    
    // Handle Hotstar normally
    if (domain.includes('hotstar.com')) {
      return handleHotstarRequest(url, details.tabId, handleTabMuting);
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

function parseHotstarAdBreakInfo(url) {
  const params = new URLSearchParams(url.split('?')[1]);
  const hasAdDuration = params.has('ad_duration');
  return {
    adDuration: hasAdDuration ? parseInt(params.get('ad_duration')) / 1000 : null, // Convert to seconds
    contentType: params.get('content_type') || ''
  };
}

function parseCricketAdDuration(url) {
  const params = new URLSearchParams(url.split('?')[1]);
  // Try both camelCase and lowercase versions
  const adName = params.get('adName') || params.get('adname');
  
  if (debugEnabled) {
    console.log('[Debug] Parsing cricket ad duration from adName:', adName);
    console.log('[Debug] Available URL params:', Array.from(params.keys()));
  }
  
  if (adName) {
    let duration = null;
    
    // Method 1: Look for pattern like "20s" anywhere in the ad name
    const secondsMatch = adName.match(/(\d+)s/);
    if (secondsMatch) {
      duration = parseInt(secondsMatch[1]);
      if (debugEnabled) {
        console.log('[Debug] Found duration pattern "Xs":', duration, 'from', secondsMatch[0]);
      }
    }
    
    // Method 2: Look for pattern like "_20" at the end (fallback or verification)
    const underscoreMatch = adName.match(/_(\d+)$/);
    if (underscoreMatch) {
      const endDuration = parseInt(underscoreMatch[1]);
      if (debugEnabled) {
        console.log('[Debug] Found duration pattern "_X":', endDuration, 'from', underscoreMatch[0]);
      }
      
      // If both patterns exist, prefer the "Xs" pattern, but verify they match
      if (duration && duration !== endDuration) {
        if (debugEnabled) {
          console.log('[Debug] Duration mismatch! Using "Xs" pattern:', duration, 'vs "_X" pattern:', endDuration);
        }
      } else if (!duration) {
        duration = endDuration;
      }
    }
    
    // Validate duration is reasonable (10-60 seconds for typical ads)
    if (duration && duration >= 10 && duration <= 60) {
      if (debugEnabled) {
        console.log('[Debug] Final parsed duration:', duration, 'seconds');
      }
      return duration;
    } else if (duration) {
      if (debugEnabled) {
        console.log('[Debug] Duration', duration, 'is outside valid range (10-60s), ignoring');
      }
    }
  }
  
  if (debugEnabled) {
    console.log('[Debug] No valid duration found, returning null');
  }
  return null;
}

function handleHotstarRequest(url, tabId, handleTabMuting) {
  // Check for cricket video
  if (url.includes(HOTSTAR_PATTERNS.CRICKET_VIDEO)) {
    logHotstarEvent(tabId, '🏏 Cricket Video Detected', { url });
    return handleTabMuting(tabId, false);
  }
  
  // Check for cricket ad start
  if (url.includes(HOTSTAR_PATTERNS.CRICKET_AD_START)) {
    // Extract key parameters for debugging (try both camelCase and lowercase)
    const params = new URLSearchParams(url.split('?')[1]);
    const adName = params.get('adName') || params.get('adname');
    const campaignName = params.get('campaignName') || params.get('campaignname');
    const goalName = params.get('goalName') || params.get('goalname');
    const eventType = params.get('eventType') || params.get('eventtype');
    
    // Always log why this was detected as an ad
    console.log('[AdMute] 🏏 CRICKET AD DETECTED - URL contains pattern:', HOTSTAR_PATTERNS.CRICKET_AD_START);
    console.log('[AdMute] Ad Details:', {
      adName: adName,
      campaignName: campaignName,
      goalName: goalName,
      eventType: eventType,
      fullURL: url
    });
    
    const adDuration = parseCricketAdDuration(url);
    logHotstarEvent(tabId, '🏏 Cricket Ad Detection', { url, adDuration });
    
    if (debugEnabled) {
      console.log('[Debug] Cricket ad URL contains ct_impression pattern');
      console.log('[Debug] Parsed duration result:', adDuration);
    }

    if (adDuration) {
      // Always log the successful duration parsing (not just in debug mode)
      console.log('[AdMute] ✅ Successfully parsed cricket ad duration:', adDuration + 's');
      console.log('[AdMute] 🔇 Starting cricket ad mute with duration:', adDuration + 's');
      logHotstarEvent(tabId, '🔇 Muting - Cricket Ad Duration: ' + adDuration + 's', { adDuration });
      handleTabMuting(tabId, true);

      // Set timer to unmute after parsed duration
      if (adTimeouts[tabId]) {
        console.log('[AdMute] ⚠️ Clearing existing timeout for tab', tabId);
        clearTimeout(adTimeouts[tabId]);
      }
      console.log('[AdMute] ⏰ Setting timer for', adDuration + 's', 'on tab', tabId);
      adTimeouts[tabId] = setTimeout(async () => {
        console.log('[AdMute] ⏰ Timer expired! Unmuting after', adDuration + 's');
        logHotstarEvent(tabId, '🔊 Unmuting - Cricket Ad Duration Complete', { adDuration });
        await handleTabMuting(tabId, false);
        // Stop countdown timer
        browser.tabs.sendMessage(tabId, { action: 'stopCountdown' }).catch(() => {});
        delete adTimeouts[tabId];
      }, adDuration * 1000);
      
      // Start countdown timer
      browser.tabs.sendMessage(tabId, { 
        action: 'startCountdown', 
        duration: adDuration 
      }).catch(() => {});
    } else {
      // Fallback to default cricket ad duration if no duration found
      console.log('[AdMute] ⚠️ Could not parse duration, using default 30s');
      console.log('[AdMute] 🔇 Starting cricket ad mute with DEFAULT duration: 30s');
      logHotstarEvent(tabId, '🔇 Muting - Cricket Ad (default 30s)', { adDuration: 30 });
      handleTabMuting(tabId, true);
      
      if (adTimeouts[tabId]) {
        console.log('[AdMute] ⚠️ Clearing existing timeout for tab', tabId, '(fallback path)');
        clearTimeout(adTimeouts[tabId]);
      }
      console.log('[AdMute] ⏰ Setting DEFAULT timer for 30s on tab', tabId);
      adTimeouts[tabId] = setTimeout(async () => {
        console.log('[AdMute] ⏰ DEFAULT Timer expired! Unmuting after 30s');
        logHotstarEvent(tabId, '🔊 Unmuting - Cricket Ad Complete (default)', { adDuration: 30 });
        await handleTabMuting(tabId, false);
        // Stop countdown timer
        browser.tabs.sendMessage(tabId, { action: 'stopCountdown' }).catch(() => {});
        delete adTimeouts[tabId];
      }, 30000);
      
      // Start countdown timer for default duration
      browser.tabs.sendMessage(tabId, { 
        action: 'startCountdown', 
        duration: 30 
      }).catch(() => {});
    }
    return;
  }
  
  // Check for regular ad start
  if (url.includes(HOTSTAR_PATTERNS.AD_START)) {
    const breakInfo = parseHotstarAdBreakInfo(url);
    logHotstarEvent(tabId, '🔴 Ad Detection', { url, breakInfo });

    if (breakInfo.adDuration === null) {
      logHotstarEvent(tabId, '🔇 Muting - No Ad Duration Parameter (will unmute on q100)', { breakInfo });
      return handleTabMuting(tabId, true);
    }

    if (breakInfo.adDuration > 0) {
      logHotstarEvent(tabId, '🔇 Muting - Ad Duration: ' + breakInfo.adDuration + 's', { breakInfo });
      handleTabMuting(tabId, true);

      // Set timer to unmute after duration
      if (adTimeouts[tabId]) {
        clearTimeout(adTimeouts[tabId]);
      }
      adTimeouts[tabId] = setTimeout(async () => {
        logHotstarEvent(tabId, '🔊 Unmuting - Ad Duration Complete', { breakInfo });
        await handleTabMuting(tabId, false);
        // Stop countdown timer
        browser.tabs.sendMessage(tabId, { action: 'stopCountdown' }).catch(() => {});
        delete adTimeouts[tabId];
      }, breakInfo.adDuration * 1000);
      
      // Start countdown timer
      browser.tabs.sendMessage(tabId, { 
        action: 'startCountdown', 
        duration: breakInfo.adDuration 
      }).catch(() => {});
    }
  }

  // Check for ad completion when no duration was provided
  if (url.includes(HOTSTAR_PATTERNS.AD_COMPLETE)) {
    logHotstarEvent(tabId, '🔊 Unmuting - Ad Complete (q100)', { url });
    // Stop countdown timer
    browser.tabs.sendMessage(tabId, { action: 'stopCountdown' }).catch(() => {});
    return handleTabMuting(tabId, false);
  }
}

// Track last pubads request time per tab
const lastPubAdsTime = {};

function handleSonyLivRequest(url, tabId, handleTabMuting) {
  // Track pubads.g requests
  if (url.includes('pubads.g.doubleclick.net')) {
    lastPubAdsTime[tabId] = Date.now();
    return;
  }
  
  // Check for drm request following a recent pubads request
  if (url.includes(SONYLIV_PATTERNS.CONTENT_RESUME)) {
    const timeSinceLastPubAds = Date.now() - (lastPubAdsTime[tabId] || 0);
    if (debugEnabled) console.log(`[SonyLIV ${getISTTime()}] DRM request:`, {
      timeSinceLastPubAds: timeSinceLastPubAds + 'ms',
      adState: adStates[tabId]
    });
    
    // If we see drm request within 2 seconds of pubads request
    if (timeSinceLastPubAds < 2000 && adStates[tabId] === 'ad') {
      adStates[tabId] = 'content';
      if (debugEnabled) console.log(`[SonyLIV ${getISTTime()}] 🟢 Content Resume (pubads->drm)`);
      delete originalVolumes[tabId];
      return handleTabMuting(tabId, false);
    }
  }
  
  // Check for ad start
  const matchedAdPattern = SONYLIV_PATTERNS.AD_START.find(pattern => url.includes(pattern.toLowerCase()));
  if (matchedAdPattern && adStates[tabId] !== 'ad') {
    adStates[tabId] = 'ad';
    if (debugEnabled) console.log(`[SonyLIV ${getISTTime()}] 🔴 Ad Start`);
    return handleTabMuting(tabId, true, false);
  }
}

// Initialize debug state on startup
browser.storage.local.get(['debugEnabled']).then((result) => {
  debugEnabled = result.debugEnabled || false;
  console.log('[AdMute] Extension loaded - Debug mode:', debugEnabled ? 'enabled' : 'disabled');
  
  // Initialize and check fact library
  manageFactLibrary();
  
  // Test the parsing function with user's actual ad name
  const testAdName = 'PR-25-018945_INDvENG2025_INDvsENG_ENGvINDFTG3T2DTOM20sEng_English_VCTA_20';
  const testUrl = `https://bifrost-api.hotstar.com/v1/events/track/ct_impression?adName=${testAdName}`;
  const testResult = parseCricketAdDuration(testUrl);
  console.log('[AdMute] Startup test - Parsing result for sample ad:', testResult + 's');
});

const MAX_STORED_FACTS = 20000;
const INITIAL_LIBRARY_TARGET = 1000;
const DAILY_ENRICHMENT_TARGET = 500;
const BATCH_SIZE = 25;
const OPENROUTER_MODEL = "openrouter/free";
const OPENROUTER_TIMEOUT_MS = 30000;
const OPENROUTER_MAX_TOKENS_PER_FACT = 80;
const OPENROUTER_BATCH_MAX_ATTEMPTS = 3;
const OPENROUTER_FILL_MAX_CONSECUTIVE_FAILURES = 6;
const FACT_MIN_LENGTH = 15;
const FACT_MAX_LENGTH = 220;
let isFetching = false;

function getOpenRouterMaxTokens(count) {
  return Math.min(1200, Math.max(120, count * OPENROUTER_MAX_TOKENS_PER_FACT));
}

function buildOpenRouterFactRequest(count, batchId) {
  return {
    model: OPENROUTER_MODEL,
    max_tokens: getOpenRouterMaxTokens(count),
    temperature: 0.8,
    presence_penalty: 0.6,
    frequency_penalty: 0.8,
    messages: [
      {
        role: "system",
        content: `You are a fact-bot. Generate exactly ${count} unique, surprising fun facts or productivity tips.
Keep each under 180 characters.
Do not repeat common examples like honey, octopuses, bananas, Venus, wombats, or Pomodoro.
End every fact with a period.
Format: Return ONLY the facts, one per line, no numbers.`
      },
      {
        role: "user",
        content: `Give me a fresh batch of facts and tips. Batch nonce: ${batchId}. Prefer obscure science, history, language, craft, food, design, and productivity facts.`
      }
    ]
  };
}

function getFactPreview(item) {
  if (!item) return null;
  return {
    type: item.type || 'Unknown',
    content: item.content || '',
    source: item.source || inferFactSource(item),
    added: item.added || null,
    model: item.model || null,
    batchId: item.batchId || null
  };
}

function normalizeFactContent(content) {
  return String(content || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isLikelyCompleteFact(content) {
  const trimmed = String(content || '').trim();
  if (trimmed.length < FACT_MIN_LENGTH || trimmed.length > FACT_MAX_LENGTH) return false;
  if (!/[.!?]["')\]]?$/.test(trimmed)) return false;
  return true;
}

function inferFactSource(item) {
  if (!item) return 'unknown';
  if (item.source) return item.source;
  if ((item.type || '').includes('AI')) return 'openrouter';
  return 'legacy-cache';
}

function summarizeFactLibrary(storedFacts = []) {
  const summary = {
    total: storedFacts.length,
    openrouter: 0,
    legacy: 0,
    unknown: 0,
    newest: null,
    oldest: null,
    recent: storedFacts.slice(-5).reverse().map(getFactPreview)
  };

  storedFacts.forEach((item) => {
    const source = inferFactSource(item);
    if (source === 'openrouter') summary.openrouter++;
    else if (source === 'legacy-cache') summary.legacy++;
    else summary.unknown++;

    if (item.added) {
      if (!summary.newest || item.added > summary.newest) summary.newest = item.added;
      if (!summary.oldest || item.added < summary.oldest) summary.oldest = item.added;
    }
  });

  return summary;
}

function getOpenRouterChoiceContent(result) {
  const choice = result && result.choices && result.choices[0];
  if (!choice) {
    throw new Error('OpenRouter response did not include choices[0]');
  }

  const content = choice.message && choice.message.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error(`OpenRouter returned empty content (finish_reason: ${choice.finish_reason || 'unknown'}, model: ${result.model || OPENROUTER_MODEL})`);
  }

  return content;
}

function parseOpenRouterFacts(content, batchId, now) {
  return content.trim().split('\n')
    .map(line => line.trim().replace(/^[0-9.-]+\s+/, ''))
    .filter(isLikelyCompleteFact)
    .map((content, index) => ({
      type: index % 2 === 0 ? "AI Fact" : "AI Tip",
      content: content,
      source: 'openrouter',
      model: OPENROUTER_MODEL,
      batchId,
      added: now
    }));
}

function filterNewFactsForLibrary(existingFacts, candidateFacts) {
  const seen = new Set((existingFacts || []).map((item) => normalizeFactContent(item.content)));
  const kept = [];
  const duplicates = [];

  candidateFacts.forEach((item) => {
    const key = normalizeFactContent(item.content);
    if (!key || seen.has(key)) {
      duplicates.push(item);
      return;
    }

    seen.add(key);
    kept.push(item);
  });

  return { kept, duplicates };
}

function pruneFactLibrary(library) {
  const seen = new Set();
  const kept = [];
  const removed = [];

  (library || []).forEach((item) => {
    const key = normalizeFactContent(item.content);
    if (!key || !isLikelyCompleteFact(item.content) || seen.has(key)) {
      removed.push(item);
      return;
    }

    seen.add(key);
    kept.push(item);
  });

  return { kept, removed };
}

async function setFactDebugState(updates) {
  const current = await browser.storage.local.get(['factDebug']);
  await browser.storage.local.set({
    factDebug: {
      ...(current.factDebug || {}),
      ...updates
    }
  });
}

async function getFactDebugSnapshot() {
  const data = await browser.storage.local.get([
    'storedFacts',
    'lastRotationDate',
    'openRouterKey',
    'factDebug',
    'lastServedFact'
  ]);

  return {
    hasOpenRouterKey: Boolean(data.openRouterKey),
    lastRotationDate: data.lastRotationDate || 0,
    isFetching,
    policy: {
      initialTarget: INITIAL_LIBRARY_TARGET,
      dailyTarget: DAILY_ENRICHMENT_TARGET,
      maxStoredFacts: MAX_STORED_FACTS,
      batchSize: BATCH_SIZE,
      batchAttempts: OPENROUTER_BATCH_MAX_ATTEMPTS,
      maxConsecutiveBatchFailures: OPENROUTER_FILL_MAX_CONSECUTIVE_FAILURES
    },
    library: summarizeFactLibrary(data.storedFacts || []),
    factDebug: data.factDebug || {},
    lastServedFact: data.lastServedFact || null
  };
}

// Library Management
async function fetchOpenRouterFactBatch(openRouterKey, count, batchId, now) {
  const startedAt = Date.now();
  if (debugEnabled) console.log(`[AdMute Facts] OpenRouter batch request started: ${count} facts (${batchId})`);

  let lastError = null;
  for (let attempt = 1; attempt <= OPENROUTER_BATCH_MAX_ATTEMPTS; attempt++) {
    try {
      const items = await fetchOpenRouterFactBatchOnce(openRouterKey, count, batchId, now);
      if (debugEnabled) console.log(`[AdMute Facts] OpenRouter batch completed: requested ${count}, parsed ${items.length}, attempt ${attempt}, ${Date.now() - startedAt}ms`);
      return items;
    } catch (error) {
      lastError = error;
      if (debugEnabled) console.log(`[AdMute Facts] OpenRouter batch attempt ${attempt}/${OPENROUTER_BATCH_MAX_ATTEMPTS} failed:`, error.message);
    }
  }

  throw lastError || new Error('OpenRouter batch failed without an error');
}

async function fetchOpenRouterFactBatchOnce(openRouterKey, count, batchId, now) {
  const controller = new AbortController();
  let timeoutId = null;
  let response;

  try {
    const fetchPromise = fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "HTTP-Referer": "https://github.com/codengod/admute",
        "X-Title": "AdMute Extension",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildOpenRouterFactRequest(count, batchId))
    });

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error(`OpenRouter request timed out after ${OPENROUTER_TIMEOUT_MS / 1000}s`));
      }, OPENROUTER_TIMEOUT_MS);
    });

    response = await Promise.race([fetchPromise, timeoutPromise]);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`OpenRouter request timed out after ${OPENROUTER_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const result = await response.json();
  const content = getOpenRouterChoiceContent(result);
  const items = parseOpenRouterFacts(content, batchId, now);

  if (items.length === 0) {
    throw new Error(`OpenRouter returned content but no usable facts (finish_reason: ${result.choices[0].finish_reason || 'unknown'}, model: ${result.model || OPENROUTER_MODEL})`);
  }

  return items;
}

async function appendFactsToLibrary(newFacts) {
  const data = await browser.storage.local.get(['storedFacts']);
  let updatedLibrary = [...(data.storedFacts || []), ...newFacts];

  if (updatedLibrary.length > MAX_STORED_FACTS) {
    updatedLibrary = updatedLibrary.slice(-MAX_STORED_FACTS);
  }

  await browser.storage.local.set({ storedFacts: updatedLibrary });
  return updatedLibrary;
}

async function manageFactLibrary(force = false) {
  if (isFetching) {
    if (debugEnabled) console.log('[AdMute Facts] Skipping fact refresh: fetch already running');
    await setFactDebugState({
      lastSkipReason: 'fetch-already-running',
      lastSkipAt: Date.now()
    });
    return getFactDebugSnapshot();
  }
  
  const data = await browser.storage.local.get(['storedFacts', 'lastRotationDate', 'openRouterKey']);
  if (!data.openRouterKey) {
    if (debugEnabled) console.log('[AdMute Facts] Skipping fact refresh: OpenRouter key is missing');
    await setFactDebugState({
      lastSkipReason: 'missing-openrouter-key',
      lastSkipAt: Date.now()
    });
    return getFactDebugSnapshot();
  }

  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  let storedFacts = data.storedFacts || [];
  const prunedLibrary = pruneFactLibrary(storedFacts);
  if (prunedLibrary.removed.length > 0) {
    storedFacts = prunedLibrary.kept;
    await browser.storage.local.set({ storedFacts });
    await setFactDebugState({
      lastPruneAt: Date.now(),
      lastPruneRemoved: prunedLibrary.removed.length,
      lastPruneLibrarySize: storedFacts.length
    });
  }

  const lastRotation = data.lastRotationDate || 0;
  const dailyRefreshDue = now - lastRotation > oneDay;
  let targetNewFacts = 0;
  let fetchReason = null;

  if (storedFacts.length < INITIAL_LIBRARY_TARGET) {
    targetNewFacts = INITIAL_LIBRARY_TARGET - storedFacts.length;
    fetchReason = 'initial-fill';
  } else if (force) {
    targetNewFacts = DAILY_ENRICHMENT_TARGET;
    fetchReason = 'forced-daily-fill';
  } else if (dailyRefreshDue) {
    targetNewFacts = DAILY_ENRICHMENT_TARGET;
    fetchReason = 'daily-enrichment';
  }

  // Conditions for fetching: 
  // 1. Forced 
  // 2. Initial library is below target
  // 3. Last rotation was > 24h ago
  if (targetNewFacts > 0) {
    isFetching = true;
    let newItems = [];
    let updatedLibrary = storedFacts;
    let failedBatchCount = 0;
    let consecutiveBatchFailures = 0;
    let skippedDuplicateCount = 0;
    try {
      if (debugEnabled) console.log(`[AdMute] Refreshing library. Current size: ${storedFacts.length}. Target new facts: ${targetNewFacts}`);
      await setFactDebugState({
        lastFetchStartedAt: now,
        lastFetchStatus: 'running',
        lastFetchError: null,
        lastFetchReason: fetchReason,
        lastFetchModel: OPENROUTER_MODEL,
        lastFetchTarget: targetNewFacts,
        lastFetchLibrarySize: storedFacts.length,
        lastFetchFailedBatches: 0,
        lastFetchConsecutiveFailures: 0
      });

      let batchSequence = 0;
      while (newItems.length < targetNewFacts) {
        batchSequence++;
        const remaining = targetNewFacts - newItems.length;
        const requestedCount = Math.min(BATCH_SIZE, remaining);
        const batchId = `or-${now}-${batchSequence}`;
        if (debugEnabled) console.log(`[AdMute Facts] Fetch progress before batch: ${newItems.length}/${targetNewFacts}`);
        await setFactDebugState({
          lastFetchStatus: 'running',
          lastFetchCount: newItems.length,
          lastFetchTarget: targetNewFacts,
          lastFetchBatchId: batchId,
          lastFetchBatchRequested: requestedCount,
          lastFetchBatchStartedAt: Date.now(),
          lastFetchLibrarySize: updatedLibrary.length,
          lastFetchBatchError: null,
          lastFetchFailedBatches: failedBatchCount,
          lastFetchConsecutiveFailures: consecutiveBatchFailures
        });
        try {
          const batchItems = await fetchOpenRouterFactBatch(data.openRouterKey, requestedCount, batchId, now);
          const { kept, duplicates } = filterNewFactsForLibrary(updatedLibrary, batchItems);
          const accepted = kept.slice(0, remaining);
          const overflow = kept.length - accepted.length;

          if (accepted.length === 0) {
            throw new Error(`OpenRouter returned no new unique complete facts for ${batchId} (${duplicates.length} duplicates skipped)`);
          }

          consecutiveBatchFailures = 0;
          skippedDuplicateCount += duplicates.length;
          newItems = [...newItems, ...accepted];
          updatedLibrary = await appendFactsToLibrary(accepted);

          await setFactDebugState({
            lastFetchStatus: 'running',
            lastFetchCount: newItems.length,
            lastFetchTarget: targetNewFacts,
            lastFetchBatchId: batchId,
            lastFetchBatchRequested: requestedCount,
            lastFetchBatchReceived: accepted.length,
            lastFetchBatchRawReceived: batchItems.length,
            lastFetchBatchSkippedDuplicates: duplicates.length,
            lastFetchBatchSkippedOverflow: overflow,
            lastFetchSkippedDuplicates: skippedDuplicateCount,
            lastFetchBatchCompletedAt: Date.now(),
            lastFetchLibrarySize: updatedLibrary.length,
            lastFetchBatchError: null,
            lastFetchFailedBatches: failedBatchCount,
            lastFetchConsecutiveFailures: consecutiveBatchFailures,
            lastFetchPreview: accepted.slice(0, 3).map(getFactPreview)
          });

          if (debugEnabled) console.log(`[AdMute Facts] Fetch progress after batch: ${newItems.length}/${targetNewFacts}. Kept ${accepted.length}/${batchItems.length}, skipped ${duplicates.length} duplicates and ${overflow} extra`);
        } catch (batchError) {
          failedBatchCount++;
          consecutiveBatchFailures++;

          await setFactDebugState({
            lastFetchStatus: 'running',
            lastFetchCount: newItems.length,
            lastFetchTarget: targetNewFacts,
            lastFetchBatchId: batchId,
            lastFetchBatchRequested: requestedCount,
            lastFetchBatchCompletedAt: Date.now(),
            lastFetchLibrarySize: updatedLibrary.length,
            lastFetchBatchError: batchError.message,
            lastFetchFailedBatches: failedBatchCount,
            lastFetchConsecutiveFailures: consecutiveBatchFailures
          });

          if (debugEnabled) console.log(`[AdMute Facts] Skipping failed batch ${batchId}:`, batchError.message);
          if (consecutiveBatchFailures >= OPENROUTER_FILL_MAX_CONSECUTIVE_FAILURES) {
            throw new Error(`OpenRouter failed ${consecutiveBatchFailures} consecutive fact batches; last error: ${batchError.message}`);
          }
        }
      }

      await browser.storage.local.set({
        lastRotationDate: now
      });

      await setFactDebugState({
        lastFetchCompletedAt: Date.now(),
        lastFetchStatus: 'success',
        lastFetchCount: newItems.length,
        lastFetchTarget: targetNewFacts,
        lastFetchLibrarySize: updatedLibrary.length,
        lastFetchFailedBatches: failedBatchCount,
        lastFetchConsecutiveFailures: consecutiveBatchFailures,
        lastFetchSkippedDuplicates: skippedDuplicateCount,
        lastFetchPreview: newItems.slice(0, 3).map(getFactPreview),
        lastFetchError: null
      });
      
      if (debugEnabled) console.log(`[AdMute] Library updated. New size: ${updatedLibrary.length}`);
    } catch (error) {
      console.error('[AdMute] Library refresh failed:', error);
      await setFactDebugState({
        lastFetchCompletedAt: Date.now(),
        lastFetchStatus: newItems.length > 0 ? 'partial-error' : 'error',
        lastFetchCount: newItems.length,
        lastFetchTarget: targetNewFacts,
        lastFetchLibrarySize: updatedLibrary.length,
        lastFetchFailedBatches: failedBatchCount,
        lastFetchConsecutiveFailures: consecutiveBatchFailures,
        lastFetchSkippedDuplicates: skippedDuplicateCount,
        lastFetchError: error.message
      });
    } finally {
      isFetching = false;
    }
  } else {
    if (debugEnabled) console.log(`[AdMute Facts] Library fresh. Size: ${storedFacts.length}, last rotation: ${lastRotation || 'never'}`);
    await setFactDebugState({
      lastSkipReason: 'library-fresh',
      lastSkipAt: Date.now(),
      lastKnownLibrarySize: storedFacts.length
    });
  }

  return getFactDebugSnapshot();
}

// Fetch educational content
async function getEducationalContent() {
  const data = await browser.storage.local.get(['storedFacts']);
  const library = data.storedFacts || [];

  // If we have a library, pick a random one
  if (library.length > 0) {
    const randomIndex = Math.floor(Math.random() * library.length);
    const item = {
      ...library[randomIndex],
      source: inferFactSource(library[randomIndex])
    };
    
    // Trigger a quiet check/refill in the background
    manageFactLibrary();
    
    if (debugEnabled) console.log('[AdMute Facts] Serving from stored library:', {
      poolSize: library.length,
      randomIndex,
      source: item.source,
      type: item.type,
      preview: item.content
    });
    await browser.storage.local.set({
      lastServedFact: {
        ...getFactPreview(item),
        servedAt: Date.now(),
        libraryIndex: randomIndex,
        librarySize: library.length
      }
    });
    return item;
  }

  // Only OpenRouter may fetch remote facts. If the library is empty, refill in
  // the background and tell the content script there is no stored fact yet.
  if (debugEnabled) console.log('[AdMute Facts] Stored library empty; starting OpenRouter refill and returning no fact');
  manageFactLibrary(true);
  await browser.storage.local.set({
    lastServedFact: {
      type: 'no-stored-fact',
      content: 'Stored fact library is empty; OpenRouter refill is running.',
      source: 'empty-store',
      servedAt: Date.now(),
      librarySize: 0
    }
  });
  await setFactDebugState({
    lastNoFactReason: 'empty-library-openrouter-refill-started',
    lastNoFactAt: Date.now()
  });
  return null;
}

// Listen for messages from popup or content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'setDebug') {
    debugEnabled = message.enabled;
    console.log('[AdMute] Debug logging', debugEnabled ? 'enabled' : 'disabled');
    return false; // Sync response
  } else if (message.action === 'getContent') {
    return getEducationalContent(); // Return promise for async response
  } else if (message.action === 'getFactDebug') {
    return getFactDebugSnapshot();
  } else if (message.action === 'refreshFactLibrary') {
    return manageFactLibrary(true);
  } else if (message.action === 'clearCache') {
    browser.storage.local.set({ storedFacts: [], lastRotationDate: 0, lastServedFact: null }).then(() => {
      setFactDebugState({
        lastClearAt: Date.now(),
        lastFetchStatus: 'cleared'
      });
      manageFactLibrary(true); // Immediate refill with new key
    });
    if (debugEnabled) console.log('[AdMute] Persistent fact library cleared');
    return false;
  } else if (message.action === 'testAdDemo') {
    // Simulate a full ad experience
    const tabId = message.tabId;
    console.log('[AdMute] 🧪 Testing ad demo on tab', tabId);
    
    // Simulate muting the tab
    handleTabMuting(tabId, true).then(() => {
      console.log('[AdMute] 🧪 Test: Tab muted');
      
      // Start countdown timer for 10 seconds
      browser.tabs.sendMessage(tabId, { 
        action: 'startCountdown', 
        duration: 10 
      }).catch(() => {});
      
      // Set timer to unmute after 10 seconds
      setTimeout(async () => {
        console.log('[AdMute] 🧪 Test: Unmuting after 10 seconds');
        await handleTabMuting(tabId, false);
        // Stop countdown timer
        browser.tabs.sendMessage(tabId, { action: 'stopCountdown' }).catch(() => {});
      }, 10000);
    });
    return true; // We'll respond later or don't need to respond
  }
});
