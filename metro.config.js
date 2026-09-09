const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The reader engine (HTML + vendored epub.js/pdf.js) ships as bundled assets that
// are copied to disk at runtime and loaded into a WKWebView over file://.
config.resolver.assetExts.push('html', 'jstxt', 'wasm');

module.exports = config;
