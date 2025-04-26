# Streaming Ad Muter - User Guide

## Overview

Streaming Ad Muter is a Chrome extension that automatically detects and mutes ads on streaming platforms like Hotstar and SonyLIV. When an ad starts playing, the extension will:
1. Automatically mute the tab
2. Show a black overlay (optional)
3. Display a countdown timer
4. Restore volume when the ad ends

## Installation

### From Chrome Web Store
*(Coming soon)*

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" using the toggle in the top-right corner
4. Click "Load unpacked"
5. Select the directory containing the extension files
6. The extension icon should appear in your Chrome toolbar

## Usage

### Basic Usage
1. Visit a supported streaming platform (Hotstar or SonyLIV)
2. Start watching any content
3. When an ad plays, the extension will automatically:
   - Mute the tab
   - Show a black overlay (if enabled)
   - Display remaining ad duration
4. Volume will be restored when the ad ends

### Extension Settings
Click the extension icon to access settings:

1. **Blackout Toggle**
   - Enable/disable the black overlay during ads
   - When disabled, ads will still be muted but remain visible

2. **Debug Mode**
   - For troubleshooting purposes
   - Logs detailed information to the browser console
   - Only enable when asked by support

### Supported Content
- Regular streaming content on Hotstar
- Live cricket matches on Hotstar
- Regular content on SonyLIV
- Both pre-roll and mid-roll ads

## Troubleshooting

### Common Issues

1. **Extension Not Detecting Ads**
   - Refresh the page
   - Make sure you're on a supported platform
   - Check if the extension is enabled
   - Try disabling other ad blockers

2. **Volume Not Restoring**
   - Click the unmute button on the video player
   - Refresh the page
   - Disable and re-enable the extension

3. **Black Overlay Stuck**
   - Toggle the blackout setting off and on
   - Refresh the page
   - Restart Chrome

### Debug Mode
If issues persist:
1. Enable Debug Mode from extension popup
2. Open Chrome DevTools (F12 or Ctrl+Shift+I)
3. Look for logs starting with "[HotstarAdBlock]"
4. Share these logs when reporting issues

## Known Limitations

1. The extension only works on supported streaming platforms
2. Some ad formats might not be detected
3. Cricket match ad detection uses a fixed 30-second duration
4. Extension needs to be manually updated when platforms change their ad delivery system

## Support

If you encounter any issues:
1. Check this troubleshooting guide
2. Enable Debug Mode and collect logs
3. Create an issue on GitHub with:
   - Detailed description of the problem
   - Steps to reproduce
   - Debug logs
   - Chrome version
   - Extension version

## Privacy

The extension:
- Does not collect any user data
- Does not send data to any servers
- Only monitors network requests on supported streaming platforms
- All processing happens locally in your browser 