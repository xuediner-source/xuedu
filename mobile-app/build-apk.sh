#!/usr/bin/env bash
# Requires Node/npm, JDK 17, and Android SDK. Provide the signing keystore
# and passwords through ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD,
# ANDROID_KEY_ALIAS, and ANDROID_KEY_PASSWORD environment variables.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
npm run build:android:release
