// Ads and the "remove ads" purchase. Only the store app (EDITION.store, running as a native
// Capacitor app) does anything here; on the web every call is a no-op and nothing is shown.
//   - an interstitial ad now and then BETWEEN games (never during play or a battle)
//   - one non-consumable purchase removes ads for good; it can be restored on a new phone
//   - consent (Google UMP) and, on iPhone, App Tracking Transparency are asked first
import { EDITION } from './edition.js';

const AD_EVERY_GAMES = 3;          // at most one ad per this many finished games ...
const AD_MIN_GAP_MS = 180000;      // ... and never more often than every 3 minutes
const OWNED_KEY = 'obento-pon:noads';

const cap = typeof window !== 'undefined' ? window.Capacitor : null;
const native = !!(EDITION.store && cap && cap.isNativePlatform && cap.isNativePlatform());
const platform = native ? cap.getPlatform() : 'web';
const plugin = (name) => (cap.registerPlugin ? cap.registerPlugin(name) : cap.Plugins[name]);

function cached() { try { return localStorage.getItem(OWNED_KEY) === '1'; } catch (e) { return false; } }
function remember(v) { try { if (v) localStorage.setItem(OWNED_KEY, '1'); else localStorage.removeItem(OWNED_KEY); } catch (e) { /* ignore */ } }

export const monetize = {
  enabled: native,
  adsRemoved: !native || cached(),
  price: '',                       // shown on the button once the store answers
  privacyOptions: false,           // the consent form can be reopened from settings
  onChange: () => {},
  _ads: null, _shop: null, _ready: false, _loaded: false,
  _games: 0, _lastAd: Date.now(),

  async init() {
    if (!native) return;
    const cfg = EDITION.ads || {};
    this._adId = (cfg[platform] || {}).interstitial;
    this._product = cfg.product || 'remove_ads';
    try { this._shop = plugin('NativePurchases'); await this.refreshOwned(); } catch (e) { /* store not available */ }
    try {
      const { product } = await this._shop.getProduct({ productIdentifier: this._product, productType: 'inapp' });
      this.price = product && product.priceString || '';
    } catch (e) { /* no price yet */ }
    this.onChange();
    if (this.adsRemoved || !this._adId) return;
    try {
      this._ads = plugin('AdMob');
      let info = await this._ads.requestConsentInfo();
      if (info.status === 'REQUIRED' && info.isConsentFormAvailable) info = await this._ads.showConsentForm();
      this.privacyOptions = info.privacyOptionsRequirementStatus === 'REQUIRED';
      if (platform === 'ios') {
        const t = await this._ads.trackingAuthorizationStatus();
        if (t.status === 'notDetermined') await this._ads.requestTrackingAuthorization();
      }
      if (info.canRequestAds === false) return;
      await this._ads.initialize({ initializeForTesting: !!cfg.testing });
      this._ready = true;
      this._ads.addListener('interstitialAdDismissed', () => this._preload());
      this._preload();
    } catch (e) { this._ready = false; }
    this.onChange();
  },

  async _preload() {
    if (!this._ready || this.adsRemoved) return;
    this._loaded = false;
    try { await this._ads.prepareInterstitial({ adId: this._adId, isTesting: !!(EDITION.ads || {}).testing }); this._loaded = true; } catch (e) { this._loaded = false; }
  },

  // call between games; `next` always runs (after the ad closes, or right away)
  async betweenGames(next) {
    this._games++;
    const due = this._games >= AD_EVERY_GAMES && Date.now() - this._lastAd >= AD_MIN_GAP_MS;
    if (!native || this.adsRemoved || !this._ready || !this._loaded || !due) { next(); return; }
    this._games = 0; this._lastAd = Date.now(); this._loaded = false;
    try { await this._ads.showInterstitial(); } catch (e) { /* show the game anyway */ }
    next();
  },

  async refreshOwned() {
    if (!this._shop) return;
    const { purchases } = await this._shop.getPurchases({ productType: 'inapp' });
    const owned = (purchases || []).some((p) => p.productIdentifier === this._product && (platform !== 'android' || String(p.purchaseState) === '1'));
    if (owned !== this.adsRemoved) { this.adsRemoved = owned; remember(owned); this.onChange(); }
  },

  async buy() {
    if (!this._shop) throw new Error('store');
    const t = await this._shop.purchaseProduct({ productIdentifier: this._product, productType: 'inapp', quantity: 1 });
    if (t && (platform !== 'android' || String(t.purchaseState) === '1')) { this.adsRemoved = true; remember(true); this.onChange(); return true; }
    return false;   // pending (e.g. paying at a convenience store): restored once it completes
  },

  async restore() {
    if (!this._shop) throw new Error('store');
    await this._shop.restorePurchases();
    await this.refreshOwned();
    return this.adsRemoved;
  },

  async privacy() { if (this._ads) await this._ads.showPrivacyOptionsForm(); },
};
