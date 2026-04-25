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

// Popup script to show current status
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    
    if (currentTab.url.includes('hotstar.com')) {
      document.querySelector('.status p').textContent = 
        currentTab.mutedInfo.muted ? 
        'Ad detected - Tab is currently muted' : 
        'Monitoring for ads - Tab is not muted';
    } else {
      const statusEl = document.querySelector('.status');
      statusEl.replaceChildren(
        el('h3', { style: 'color: #666;', text: 'Not on Hotstar' }),
        el('p', { text: 'Extension only works on hotstar.com' })
      );
    }

    // Load settings
    const result = await browser.storage.local.get(['debugEnabled', 'overlayMode', 'openRouterKey']);
    const debugToggle = document.getElementById('debugToggle');
    debugToggle.checked = result.debugEnabled || false;
    
    // Load overlay mode setting
    const overlayMode = result.overlayMode || 'educational';
    const modeRadio = document.getElementById(`mode${overlayMode.charAt(0).toUpperCase() + overlayMode.slice(1)}`);
    if (modeRadio) modeRadio.checked = true;

    // Load OpenRouter key
    const openRouterInput = document.getElementById('openRouterKey');
    if (openRouterInput) openRouterInput.value = result.openRouterKey || '';

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
