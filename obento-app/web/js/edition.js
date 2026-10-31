// The store app build: no family photos, ads between games with a purchase that removes them.
// obento-app/build.mjs fills in the ad / product ids and links from obento-app/app.config.json.
export const EDITION = {
  store: true,
  version: '1.0.0',
  shareUrl: '',        // the store page, once the app is published; empty = no share buttons
  privacyUrl: '',      // the privacy policy page
  ads: {},             // { android: { interstitial }, ios: { interstitial }, product, testing }
};
