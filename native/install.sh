#!/usr/bin/env bash
# install.sh — set up the AdMute audio-detection native helper for Firefox.
#
# Run this ONCE after installing the Streaming Ad Muter addon if you want
# audio-based ad detection (stitched/server-side ads with no overlay).
#
#   ./native/install.sh           install / update
#   ./native/install.sh remove    uninstall the native host
#
# What it does:
#   1. Builds the `tapmon` Core Audio capturer (macOS 14.4+; no driver install).
#   2. Writes the Firefox native-messaging host manifest pointing at the detector.
# It does NOT touch the addon itself (install that from AMO / about:debugging).
set -euo pipefail

GECKO_ID="streaming-ad-muter@devopsbytes.com"
HOST_NAME="com.devopsbytes.admute"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NM_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
MANIFEST="$NM_DIR/$HOST_NAME.json"

c() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }   # color echo

if [[ "${1:-}" == "remove" ]]; then
  rm -f "$MANIFEST" && c '33' "removed $MANIFEST"
  exit 0
fi

# 1. build tapmon (NO -O: the optimizer segfaults on the nested withUnsafe/FFT closures)
if ! command -v swiftc >/dev/null 2>&1; then
  c '31' "swiftc not found — install Xcode command line tools: xcode-select --install"; exit 1
fi
c '36' "building tapmon (Core Audio capturer)…"
swiftc "$HERE/tapmon.swift" -o "$HERE/tapmon" \
  -framework CoreAudio -framework AudioToolbox -framework AVFoundation -framework Accelerate
chmod +x "$HERE/tapmon" "$HERE/admute-detector"

# soft dependency: SwitchAudioSource only used to display the output device name
command -v SwitchAudioSource >/dev/null 2>&1 || \
  c '33' "note: SwitchAudioSource not found (optional; brew install switchaudio-osx for device name in status)"

# 2. write the native-messaging host manifest (absolute path is required by Firefox)
mkdir -p "$NM_DIR"
cat > "$MANIFEST" <<JSON
{
  "name": "$HOST_NAME",
  "description": "AdMute audio ad detector",
  "path": "$HERE/admute-detector",
  "type": "stdio",
  "allowed_extensions": ["$GECKO_ID"]
}
JSON

c '32' "installed native host:"
echo "    manifest: $MANIFEST"
echo "    detector: $HERE/admute-detector"
echo "    tapmon:   $HERE/tapmon"
c '36' "Now enable 'Audio ad detection' in the addon popup. Stock Firefox — no debug build needed."
