# Contributing to Streaming Ad Muter

Thank you for your interest in contributing to Streaming Ad Muter! This document provides guidelines and information for contributors.

## Development Setup

1. Fork and clone the repository
2. Load the extension in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable Developer Mode
   - Click "Load unpacked"
   - Select the project directory

### Project Structure
```
.
├── manifest.json        # Extension configuration
├── background.js       # Core ad detection logic
├── content.js         # Page interaction and overlay
├── popup.html         # Extension popup UI
├── popup.js          # Popup functionality
├── rules.json        # Ad detection rules
├── icon.png         # Extension icon
└── icon.svg         # Vector icon source
```

## Development Guidelines

### Code Style
- Use consistent indentation (2 spaces)
- Follow JavaScript best practices
- Add comments for complex logic
- Keep functions focused and modular

### Testing
1. Manual Testing
   - Test on both Hotstar and SonyLIV
   - Test with different types of content
   - Verify ad detection accuracy
   - Check overlay functionality
   - Validate volume control

2. Debug Mode
   - Enable debug mode for development
   - Monitor console logs
   - Verify correct event detection

### Adding Support for New Platforms

1. Update `manifest.json`:
   ```json
   {
     "host_permissions": [
       "*://*.newplatform.com/*"
     ],
     "content_scripts": [{
       "matches": ["*://*.newplatform.com/*"]
     }]
   }
   ```

2. Add detection rules in `background.js`:
   ```javascript
   if (url.includes('newplatform.com')) {
     handleNewPlatformRequest(url, tabId);
   }
   ```

3. Test thoroughly before submitting PR

### Pull Request Process

1. Create a new branch for your feature
2. Make your changes
3. Test thoroughly
4. Update documentation
5. Submit PR with:
   - Clear description
   - Testing details
   - Screenshots if UI changes
   - Related issue numbers

## Common Tasks

### Adding New Ad Detection Rules

1. Identify ad API endpoints using DevTools
2. Add detection patterns to `background.js`
3. Test with various content types
4. Document new patterns

### Modifying the Overlay

1. Update styles in `content.js`
2. Test on different screen sizes
3. Verify z-index handling
4. Check performance impact

### Debugging Tips

1. Enable Debug Mode
2. Use Chrome DevTools Network tab
3. Monitor console logs
4. Test edge cases:
   - Network issues
   - Multiple tabs
   - Platform updates

## Building for Release

1. Update version in `manifest.json`
2. Test all features
3. Run `make package` to create zip
4. Test the packaged extension

## Documentation

When adding features, update:
1. Technical documentation
2. User guide
3. README.md
4. Inline code comments

## Getting Help

- Check existing issues
- Join discussions
- Ask questions in PR comments
- Review similar PRs

## Code of Conduct

- Be respectful and inclusive
- Follow project guidelines
- Help others learn
- Give constructive feedback

## License

By contributing, you agree that your contributions will be licensed under the project's license. 