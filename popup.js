const MODEL_PRESETS = [
  'openrouter/free',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-4o-mini',
  'google/gemini-2.5-flash',
  'meta-llama/llama-3.3-70b-instruct:free'
];
const DEFAULT_CATEGORIES_PRESET = {
  Science: true,
  History: true,
  Geography: true,
  Space: true,
  Technology: true,
  Language: true,
  Food: true,
  Sports: true,
  "Arts & Music": true,
  "Nature & Animals": true,
  "Productivity Tips": true
};

function formatTime(value) {
  if (!value) return 'never';
  return new Date(value).toLocaleString();
}

function el(tag, opts = {}, ...children) {
  const node = document.createElement(tag);
  if (opts.style) node.style.cssText = opts.style;
  if (opts.text != null) node.textContent = String(opts.text);
  for (const child of children) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function labeled(label, ...rest) {
  return el('div', {}, el('strong', { text: label + ' ' }), ...rest);
}

function renderFactStore(snapshot) {
  const summary = document.getElementById('factStoreSummary');
  if (!summary) return;

  const library = snapshot.library || {};
  const debug = snapshot.factDebug || {};
  const policy = snapshot.policy || {};
  const lastServed = snapshot.lastServedFact;

  summary.replaceChildren();

  summary.appendChild(labeled('OpenRouter key:', snapshot.hasOpenRouterKey ? 'configured' : 'missing'));
  if (snapshot.config) {
    summary.appendChild(labeled('Model:', snapshot.config.model || '?'));
    const cats = snapshot.config.categories || [];
    summary.appendChild(labeled('Categories:', cats.length ? `${cats.length} active` : 'none'));
  }
  if (typeof snapshot.recentRingSize === 'number') {
    summary.appendChild(labeled('Recent-served ring:', `${snapshot.recentRingSize} / ${snapshot.recentRingMax || '?'}`));
  }
  summary.appendChild(labeled('Library:',
    `${library.total || 0} / ${policy.maxStoredFacts || '?'} facts (${library.openrouter || 0} OpenRouter, ${library.legacy || 0} legacy)`));
  summary.appendChild(labeled('Policy:',
    `initial ${policy.initialTarget || '?'}; daily +${policy.dailyTarget || '?'}; batch ${policy.batchSize || '?'}; retries ${policy.batchAttempts || '?'}; stop after ${policy.maxConsecutiveBatchFailures || '?'} bad batches`));
  summary.appendChild(labeled('Fetch:',
    `${debug.lastFetchStatus || 'not run'} ${debug.lastFetchCount ? `(${debug.lastFetchCount}/${debug.lastFetchTarget || '?'})` : ''} at ${formatTime(debug.lastFetchCompletedAt || debug.lastFetchStartedAt)}`));

  if (debug.lastFetchReason) summary.appendChild(labeled('Reason:', debug.lastFetchReason));
  if (debug.lastFetchFailedBatches) {
    summary.appendChild(labeled('Batch failures:',
      `${debug.lastFetchFailedBatches} total; ${debug.lastFetchConsecutiveFailures || 0} consecutive`));
  }
  if (debug.lastPruneAt) {
    summary.appendChild(labeled('Pruned:',
      `removed ${debug.lastPruneRemoved || 0} duplicate/incomplete facts; library ${debug.lastPruneLibrarySize || 0} at ${formatTime(debug.lastPruneAt)}`));
  }
  if (debug.lastFetchBatchCompletedAt) {
    summary.appendChild(labeled('Last batch:',
      `${debug.lastFetchBatchId || 'unknown'} requested ${debug.lastFetchBatchRequested || '?'}; kept ${debug.lastFetchBatchReceived || '?'} of ${debug.lastFetchBatchRawReceived || debug.lastFetchBatchReceived || '?'}; skipped ${debug.lastFetchBatchSkippedDuplicates || 0} at ${formatTime(debug.lastFetchBatchCompletedAt)}`));
  }
  if (debug.lastSkipReason) summary.appendChild(labeled('Last skip:', `${debug.lastSkipReason} at ${formatTime(debug.lastSkipAt)}`));
  if (debug.lastNoFactReason) summary.appendChild(labeled('No fact:', `${debug.lastNoFactReason} at ${formatTime(debug.lastNoFactAt)}`));

  summary.appendChild(labeled('Last served:',
    lastServed ? `${lastServed.source} / ${lastServed.type} at ${formatTime(lastServed.servedAt)}` : 'none yet'));
  if (lastServed) {
    summary.appendChild(el('div', { style: 'margin-top: 4px;' }, el('em', { text: lastServed.content })));
  }
  if (debug.lastFetchError) {
    summary.appendChild(el('div', { style: 'margin-top: 4px; color: #dc2626;' },
      el('strong', { text: 'Error: ' }), debug.lastFetchError));
  }

  const recent = library.recent || [];
  if (recent.length) {
    const ul = el('ul', { style: 'padding-left: 18px; margin: 6px 0 0 0;' });
    for (const item of recent) {
      ul.appendChild(el('li', {},
        el('strong', { text: (item.source || '') + ': ' }),
        String(item.content || '').slice(0, 90)));
    }
    const details = el('details', { style: 'margin-top: 6px;' },
      el('summary', { text: 'Recent cached facts' }), ul);
    summary.appendChild(details);
  }
}

async function refreshFactStorePanel() {
  const snapshot = await browser.runtime.sendMessage({ action: 'getFactDebug' });
  console.log('[AdMute] Fact library snapshot:', snapshot);
  renderFactStore(snapshot);
}

async function clearAndRefetch() {
  await browser.runtime.sendMessage({ action: 'clearCache' });
  setTimeout(refreshFactStorePanel, 750);
}

async function initFactGenConfigUI(cfgData) {
  const select = document.getElementById('factModelSelect');
  const customInput = document.getElementById('factModelCustom');
  const extrasInput = document.getElementById('factCategoriesExtras');
  const grid = document.getElementById('factCategoriesGrid');
  if (!select || !grid) return;

  // Model: match preset or fall into Custom
  const storedModel = String(cfgData.factModel || 'openrouter/free').trim() || 'openrouter/free';
  if (MODEL_PRESETS.includes(storedModel)) {
    select.value = storedModel;
    customInput.hidden = true;
    customInput.value = '';
  } else {
    select.value = '__custom__';
    customInput.hidden = false;
    customInput.value = storedModel;
  }
  select.addEventListener('change', async () => {
    if (select.value === '__custom__') {
      customInput.hidden = false;
      customInput.focus();
      // Don't save yet — wait for user to type a slug and trigger change on the input
      return;
    }
    customInput.hidden = true;
    customInput.value = '';
    await browser.storage.local.set({ factModel: select.value });
    clearAndRefetch();
  });
  customInput.addEventListener('change', async () => {
    const slug = customInput.value.trim();
    if (!slug) return;
    await browser.storage.local.set({ factModel: slug });
    clearAndRefetch();
  });

  // Categories grid
  const storedPreset = cfgData.factCategoriesPreset || DEFAULT_CATEGORIES_PRESET;
  grid.replaceChildren();
  Object.keys(DEFAULT_CATEGORIES_PRESET).forEach((name) => {
    const id = 'cat_' + name.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    const checked = storedPreset[name] !== false; // default true
    const cb = el('input', {});
    cb.type = 'checkbox';
    cb.id = id;
    cb.checked = checked;
    cb.style.cssText = 'margin-right: 6px;';
    cb.addEventListener('change', async () => {
      const current = (await browser.storage.local.get(['factCategoriesPreset'])).factCategoriesPreset || { ...DEFAULT_CATEGORIES_PRESET };
      current[name] = cb.checked;
      await browser.storage.local.set({ factCategoriesPreset: current });
      clearAndRefetch();
    });
    const label = el('label', { style: 'display: flex; align-items: center; cursor: pointer;' });
    label.htmlFor = id;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(name));
    grid.appendChild(label);
  });

  // Extras
  extrasInput.value = String(cfgData.factCategoriesExtras || '');
  extrasInput.addEventListener('change', async () => {
    await browser.storage.local.set({ factCategoriesExtras: extrasInput.value });
    clearAndRefetch();
  });
}

// Popup script to show current status
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    
    const SUPPORTED_SITES = /(^|\.)(hotstar|sonyliv|zee5)\.com$/;
    let currentHost = '';
    try { currentHost = new URL(currentTab.url).hostname; } catch (e) { /* about:, etc. */ }

    if (SUPPORTED_SITES.test(currentHost)) {
      document.querySelector('.status p').textContent =
        currentTab.mutedInfo.muted ?
        'Ad detected - Tab is currently muted' :
        'Monitoring for ads - Tab is not muted';
    } else {
      const statusEl = document.querySelector('.status');
      statusEl.replaceChildren(
        el('h3', { style: 'color: #666;', text: 'Not on a supported site' }),
        el('p', { text: 'Works on Hotstar, SonyLIV and Zee5' })
      );
    }

    // Load settings
    const result = await browser.storage.local.get(['debugEnabled', 'overlayMode', 'openRouterKey', 'audioDetectEnabled']);
    const debugToggle = document.getElementById('debugToggle');
    debugToggle.checked = result.debugEnabled || false;
    
    // Load overlay mode setting
    const overlayMode = result.overlayMode || 'educational';
    const modeRadio = document.getElementById(`mode${overlayMode.charAt(0).toUpperCase() + overlayMode.slice(1)}`);
    if (modeRadio) modeRadio.checked = true;

    // Load OpenRouter key
    const openRouterInput = document.getElementById('openRouterKey');
    if (openRouterInput) openRouterInput.value = result.openRouterKey || '';

    // Load fact-gen config (model + categories + extras)
    const cfgData = await browser.storage.local.get([
      'factModel', 'factCategoriesPreset', 'factCategoriesExtras'
    ]);
    await initFactGenConfigUI(cfgData);

    // Handle OpenRouter key changes
    if (openRouterInput) {
      openRouterInput.addEventListener('change', async (e) => {
        await browser.storage.local.set({ openRouterKey: e.target.value });
        console.log('OpenRouter key updated');
        // Clear cache in background
        browser.runtime.sendMessage({ action: 'clearCache' });
        setTimeout(refreshFactStorePanel, 750);
      });
    }

    // Handle debug toggle
    debugToggle.addEventListener('change', async (e) => {
      await browser.storage.local.set({ debugEnabled: e.target.checked });
      // Notify background script of debug state change
      browser.runtime.sendMessage({
        action: 'setDebug',
        enabled: e.target.checked
      });
    });

    // Audio ad detection (native helper) ----------------------------------
    const audioToggle = document.getElementById('audioDetectToggle');
    const audioStatusEl = document.getElementById('audioStatus');
    audioToggle.checked = result.audioDetectEnabled || false;

    function renderAudioStatus(s) {
      if (!s || !s.enabled) { audioStatusEl.textContent = 'Off'; return; }
      if (s.error && !s.connected) {
        audioStatusEl.innerHTML = '⚠️ Helper not reachable. Run <code>native/install.sh</code> once.';
        return;
      }
      if (!s.connected) { audioStatusEl.textContent = 'Connecting…'; return; }
      const out = s.output ? ` · ${s.output}` : '';
      if (s.muted) {
        audioStatusEl.textContent = s.mode === 'manual'
          ? `🔇 Ad muted (tap the on-screen button when play resumes)${out}`
          : `🔇 Ad muted — auto-unmutes when the game returns${out}`;
      } else {
        const mute = s.mutable === false ? 'manual mute (non-mutable output)' : 'auto-mute';
        audioStatusEl.textContent = `🎧 Listening · ${mute}${out}`;
      }
    }

    async function pollAudioStatus() {
      try {
        const s = await browser.runtime.sendMessage({ action: 'getAudioStatus' });
        renderAudioStatus(s);
      } catch (e) { /* background asleep */ }
    }

    audioToggle.addEventListener('change', async (e) => {
      await browser.runtime.sendMessage({ action: 'setAudioDetect', enabled: e.target.checked });
      setTimeout(pollAudioStatus, 300);
    });

    pollAudioStatus();
    setInterval(pollAudioStatus, 1500);   // live status while the popup is open

    // Handle overlay mode changes
    document.querySelectorAll('input[name="overlayMode"]').forEach(radio => {
      radio.addEventListener('change', async (e) => {
        if (e.target.checked) {
          await browser.storage.local.set({ overlayMode: e.target.value });
          console.log('Overlay mode changed to:', e.target.value);
        }
      });
    });

    document.getElementById('refreshFactStore').addEventListener('click', async () => {
      await refreshFactStorePanel();
    });

    document.getElementById('forceFactRefresh').addEventListener('click', async () => {
      const button = document.getElementById('forceFactRefresh');
      button.textContent = 'Fetching...';
      button.disabled = true;
      try {
        const snapshot = await browser.runtime.sendMessage({ action: 'refreshFactLibrary' });
        console.log('[AdMute] Forced fact refresh snapshot:', snapshot);
        renderFactStore(snapshot);
      } finally {
        button.textContent = 'Fetch More';
        button.disabled = false;
      }
    });

    document.getElementById('clearFactStore').addEventListener('click', async () => {
      await browser.runtime.sendMessage({ action: 'clearCache' });
      setTimeout(refreshFactStorePanel, 750);
    });

    // Handle test buttons
    document.getElementById('testAdDemo').addEventListener('click', async () => {
      try {
        // Send test message to background script
        await browser.runtime.sendMessage({ 
          action: 'testAdDemo',
          tabId: currentTab.id
        });
        // Close popup after triggering test
        window.close();
      } catch (error) {
        console.error('Error triggering test:', error);
      }
    });

    document.getElementById('testOverlayOnly').addEventListener('click', async () => {
      try {
        // Send message directly to content script to show overlay
        await browser.tabs.sendMessage(currentTab.id, { 
          action: 'showOverlay'
        });
        // Close popup after triggering test
        window.close();
      } catch (error) {
        console.error('Error showing overlay:', error);
      }
    });

    await refreshFactStorePanel();

  } catch (error) {
    console.error('Error updating popup:', error);
  }
});
