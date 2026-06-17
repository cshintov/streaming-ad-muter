# Hotstar Ad Muter

A Firefox extension that automatically mutes ads on Hotstar while preserving your viewing experience.

## Features

- Automatically detects and mutes ads on Hotstar
- Handles both cricket match ads and regular content ads differently
- Preserves your volume settings before and after ads
- Works with multiple consecutive ads in ad breaks
- Cleans up when you navigate away or close tabs

## How It Works

### Cricket Match Ads
When watching cricket matches, the extension:
1. Detects ad starts via the `ct_impression` endpoint
2. Mutes the tab immediately
3. Automatically unmutes after 30 seconds (standard cricket ad duration)

### Regular Content Ads (Movies/Shows)
For regular content, the extension:
1. Detects ad breaks using the `shifu_inventory` endpoint
2. Parses the ad break information to know how many ads to expect
3. Tracks completion of each ad via the `shifu_quartile_q100` endpoint
4. Only unmutes after all ads in the break are finished

### Technical Implementation

The extension uses two main components:

1. Background Script (Network Request Monitoring):
   - Monitors network requests to detect ad-related URLs
   - Handles tab muting/unmuting based on ad detection
   - Maintains state for multiple ads in a break
   - Uses URL parameters to determine ad break length
   - Tracks completion state for each ad in sequence

2. Content Script (DOM Monitoring):
   - Watches for visual ad indicators in the page
   - Provides backup ad detection through DOM elements
   - Preserves volume state during muting
   - Acts as a fallback if network detection fails

### State Management

The extension maintains several states:
- Original volume levels before muting
- Current ad break information (number of ads, current position)
- Number of completed ads in a break
- Pending unmute operations
- Break numbers and total breaks in content

### Ad Break Detection

The extension parses URL parameters to understand ad breaks:
- `break_slot_count`: Total number of ads in the break
- `break_slot_filled`: Number of ad slots actually filled
- `break_no`: Current break number in sequence
- `break_total`: Total number of breaks in content

### Cleanup

Automatic cleanup occurs when:
- You close a tab
- Navigate away from Hotstar
- Complete an ad break
- Switch to different content

## Installation

1. Download the extension from Firefox Add-ons
2. Grant necessary permissions for tab access and network monitoring
3. Start watching Hotstar - ads will be automatically muted

## Audio Ad Detection (beta, macOS only)

Some live streams (e.g. Zee5 cricket) splice ads directly into the video with no DOM
overlay or distinct ad-pod network request, so the DOM/network detectors above can't see
them. The optional audio detector catches these by listening to the system audio output
and muting when the crowd-bed audio characteristic of live sport drops out (an ad).

This needs a small **native helper** that the AMO `.xpi` cannot bundle — install it
separately (one time, macOS 14.4+):

```sh
cd native && ./install.sh
```

It compiles the Core Audio capturer (`tapmon`) from `tapmon.swift` and registers the
native-messaging host. Then enable **"Audio ad detection (beta)"** in the popup. Remove
with `./install.sh remove`. The helper captures system audio locally only — nothing leaves
the machine.

## Permissions Required

- `webRequest`: To monitor network requests for ad detection
- `tabs`: To control tab muting
- `storage`: To persist extension settings
- `nativeMessaging`: To talk to the optional audio-detection helper (see above)
- Host permissions for Hotstar domains

## Development

Built with Firefox WebExtensions API. To contribute:

1. Clone the repository
2. Load the extension in Firefox (about:debugging)
3. Make changes and test with Hotstar
4. Submit pull requests with improvements

## License

MIT License - Feel free to use and modify as needed.
