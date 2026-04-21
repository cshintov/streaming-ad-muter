function formatTime(value) {
  if (!value) return 'never';
  return new Date(value).toLocaleString();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderFactStore(snapshot) {
  const summary = document.getElementById('factStoreSummary');
  if (!summary) return;

  const library = snapshot.library || {};
  const debug = snapshot.factDebug || {};
  const policy = snapshot.policy || {};
  const lastServed = snapshot.lastServedFact;
  const recent = (library.recent || [])
    .map((item) => `<li><strong>${escapeHtml(item.source)}</strong>: ${escapeHtml(item.content).slice(0, 90)}</li>`)
    .join('');

  summary.innerHTML = `
    <div><strong>OpenRouter key:</strong> ${snapshot.hasOpenRouterKey ? 'configured' : 'missing'}</div>
    <div><strong>Library:</strong> ${library.total || 0} / ${policy.maxStoredFacts || '?'} facts (${library.openrouter || 0} OpenRouter, ${library.legacy || 0} legacy)</div>
    <div><strong>Policy:</strong> initial ${policy.initialTarget || '?'}; daily +${policy.dailyTarget || '?'}; batch ${policy.batchSize || '?'}; retries ${policy.batchAttempts || '?'}; stop after ${policy.maxConsecutiveBatchFailures || '?'} bad batches</div>
    <div><strong>Fetch:</strong> ${escapeHtml(debug.lastFetchStatus || 'not run')} ${debug.lastFetchCount ? `(${debug.lastFetchCount}/${debug.lastFetchTarget || '?'})` : ''} at ${formatTime(debug.lastFetchCompletedAt || debug.lastFetchStartedAt)}</div>
    ${debug.lastFetchReason ? `<div><strong>Reason:</strong> ${escapeHtml(debug.lastFetchReason)}</div>` : ''}
    ${debug.lastFetchFailedBatches ? `<div><strong>Batch failures:</strong> ${debug.lastFetchFailedBatches} total; ${debug.lastFetchConsecutiveFailures || 0} consecutive</div>` : ''}
    ${debug.lastPruneAt ? `<div><strong>Pruned:</strong> removed ${debug.lastPruneRemoved || 0} duplicate/incomplete facts; library ${debug.lastPruneLibrarySize || 0} at ${formatTime(debug.lastPruneAt)}</div>` : ''}
    ${debug.lastFetchBatchCompletedAt ? `<div><strong>Last batch:</strong> ${escapeHtml(debug.lastFetchBatchId || 'unknown')} requested ${debug.lastFetchBatchRequested || '?'}; kept ${debug.lastFetchBatchReceived || '?'} of ${debug.lastFetchBatchRawReceived || debug.lastFetchBatchReceived || '?'}; skipped ${debug.lastFetchBatchSkippedDuplicates || 0} at ${formatTime(debug.lastFetchBatchCompletedAt)}</div>` : ''}
    ${debug.lastSkipReason ? `<div><strong>Last skip:</strong> ${escapeHtml(debug.lastSkipReason)} at ${formatTime(debug.lastSkipAt)}</div>` : ''}
    ${debug.lastNoFactReason ? `<div><strong>No fact:</strong> ${escapeHtml(debug.lastNoFactReason)} at ${formatTime(debug.lastNoFactAt)}</div>` : ''}
    <div><strong>Last served:</strong> ${lastServed ? `${escapeHtml(lastServed.source)} / ${escapeHtml(lastServed.type)} at ${formatTime(lastServed.servedAt)}` : 'none yet'}</div>
    ${lastServed ? `<div style="margin-top: 4px;"><em>${escapeHtml(lastServed.content)}</em></div>` : ''}
    ${debug.lastFetchError ? `<div style="margin-top: 4px; color: #dc2626;"><strong>Error:</strong> ${escapeHtml(debug.lastFetchError)}</div>` : ''}
    ${recent ? `<details style="margin-top: 6px;"><summary>Recent cached facts</summary><ul style="padding-left: 18px; margin: 6px 0 0 0;">${recent}</ul></details>` : ''}
  `;
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
      document.querySelector('.status').innerHTML = `
        <h3 style="color: #666;">Not on Hotstar</h3>
        <p>Extension only works on hotstar.com</p>
      `;
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
