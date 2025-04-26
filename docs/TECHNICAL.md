# Streaming Ad Muter - Technical Documentation

## Architecture Overview

The Streaming Ad Muter is a Chrome extension built using Manifest V3 that automatically detects and mutes ads on streaming platforms like Hotstar and SonyLIV. The extension consists of several key components that work together:

1. Background Service Worker (`background.js`)
2. Content Script (`content.js`)
3. Popup Interface (`popup.html` & `popup.js`)

For detailed information about the unmuting mechanism, please see [How Unmuting Works](how-unmute-works.md).

## Component Details

### 1. Background Service Worker (background.js)

The background service worker is the core of the extension, responsible for:

#### Ad Detection
- Monitors network requests using the `webRequest` API
- Detects ads through multiple methods:
  - Regular stream ads via `bifrost-api.hotstar.com/v1/events/track/shifu_impression`
  - Cricket stream ads via `bifrost-api.hotstar.com/v1/events/track/ct_impression`
  - Backup detection through `hesads` URLs during ad breaks

#### State Management
- Maintains ad break states:
  - `isInAdBreak`: For regular stream ads
  - `isCricketAdBreak`: For cricket stream ads
- Handles debug mode state through chrome.storage

#### Tab Control
- Manages tab muting through `chrome.tabs.update`
- Communicates with content script for visual overlay
- Handles tab URL changes and resets states accordingly

### 2. Content Script (content.js)

The content script runs in the context of streaming websites and manages:

#### Visual Overlay
- Creates and manages a semi-transparent overlay during ad breaks
- Shows countdown timer for ad duration
- Supports enabling/disabling through extension settings

#### User Preferences
- Maintains blackout preferences through chrome.storage
- Updates overlay visibility based on user preferences
- Handles real-time preference changes

### 3. Popup Interface

The popup provides user controls and information:

#### Features
- Toggle for blackout functionality during ads
- Debug mode toggle for troubleshooting
- Status display showing supported platforms
- Real-time settings synchronization

## How Ad Detection Works

### Regular Stream Ads
1. Extension monitors network requests
2. When an ad impression event is detected:
   - Tab is muted
   - Blackout overlay is shown (if enabled)
   - Countdown timer starts (if duration available)
3. When ad ends (quartile_q100 event):
   - Tab is unmuted
   - Overlay is removed

### Cricket Stream Ads
1. Special detection for cricket streams
2. Uses different API endpoints for detection
3. Default 30-second muting period
4. Unmutes when regular content URLs are detected

## User Preferences

The extension stores two main preferences:
- `blackoutEnabled`: Controls the visual overlay during ads
- `debug`: Enables detailed console logging for troubleshooting

## Security Considerations

1. Content script uses high z-index for overlay but sets `pointer-events: none`
2. Background worker validates tab URLs before taking action
3. Error handling for all chrome API calls
4. No external dependencies or remote code execution

## Debugging

The extension includes a debug mode that can be enabled from the popup interface. When enabled, it logs:
- Ad detection events
- State changes
- Tab muting operations
- Network request information

## Limitations

1. Ad detection relies on specific API endpoints and may need updates if streaming platforms change their infrastructure
2. Cricket stream detection uses fixed duration (30s) due to limitations in duration detection
3. Some ad formats may not be detected if they use different delivery mechanisms

## Future Improvements

1. Support for more streaming platforms
2. Machine learning-based ad detection
3. Custom duration settings for cricket ads
4. Enhanced error recovery mechanisms
5. Analytics for ad detection accuracy 