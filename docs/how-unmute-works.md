# How Unmuting Works

This document explains the unmuting mechanism in the Streaming Ad Muter extension.

## Overview

The extension uses multiple methods to detect when an ad has ended and restore the tab's volume. The unmuting logic is primarily handled in `background.js` through different triggers and safety mechanisms.

## Unmuting Triggers

### 1. Regular Stream Ads

When a regular ad ends, it's detected through the `shifu_quartile_q100` event:

```javascript
if (url.includes('bifrost-api.hotstar.com/v1/events/track/shifu_quartile_q100')) {
    console.log('Regular ad break ended');
    isInAdBreak = false;
    handleTabMuting(tabId, false);
    return;
}
```

This event indicates that the ad has completed 100% of its duration. The extension then:
- Sets `isInAdBreak` to false
- Calls `handleTabMuting` with `shouldMute = false`

### 2. Cricket Stream Ads

For cricket streams, unmuting is triggered when regular content is detected:

```javascript
if (url.includes('hssportsprepack.akamaized.net/videos/cricket')) {
    logAdEvent('Cricket content URL detected', { 
      tabId, 
      url,
      wasInAdBreak: isCricketAdBreak 
    });
    
    if (isCricketAdBreak) {
      logAdEvent('Cricket content resumed - ending ad break');
      isCricketAdBreak = false;
      handleTabMuting(tabId, false);
    }
    return;
}
```

The extension:
- Detects regular cricket content URL
- If we were in a cricket ad break, unmutes the tab
- Sets `isCricketAdBreak` to false

## Core Unmuting Function

The actual unmuting is handled by the `handleTabMuting` function:

```javascript
async function handleTabMuting(tabId, shouldMute, duration = null) {
  try {
    const tab = await chrome.tabs.get(tabId);
    logAdEvent('Muting state change requested', {
      tabId,
      shouldMute,
      duration,
      currentlyMuted: tab.mutedInfo?.muted,
      url: tab.url
    });

    // Only mute if tab URL contains hotstar.com
    if (!tab.url || !tab.url.includes('hotstar.com')) {
      return;
    }
    
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
```

When unmuting (`shouldMute = false`), the function:
1. Uses Chrome's tab API to unmute: `chrome.tabs.update(tabId, { muted: false })`
2. Removes the visual overlay: `handleBlackout(tabId, false)`
3. Logs the state change if debug mode is enabled

## Safety Mechanisms

### URL Change Detection

The extension includes a safety mechanism that unmutes when the URL changes:

```javascript
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    isInAdBreak = false;
    isCricketAdBreak = false;
    handleTabMuting(tabId, false);
  }
});
```

This ensures that:
- Tab is unmuted if user navigates away during an ad
- States are reset to prevent stuck states
- Works as a fallback if normal unmuting triggers fail

### Error Handling

The unmuting process includes error handling:
- Catches and logs errors during tab updates
- Validates tab URL before taking action
- Ensures overlay is removed even if unmuting fails

## Debugging Unmute Issues

If unmuting isn't working:

1. Enable Debug Mode from extension popup
2. Check console logs for events:
   - Ad end detection
   - Unmuting requests
   - Any errors during unmuting
3. Verify tab URL is supported
4. Check if manual unmute works through browser controls

## Common Edge Cases

1. **Multiple Tabs**: Each tab is handled independently
2. **Network Issues**: May delay or prevent ad end detection
3. **Platform Updates**: Changes to ad delivery system may affect detection
4. **Tab Navigation**: URL change detection serves as backup 