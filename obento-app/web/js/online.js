// Online battle connection: two phones talk directly (WebRTC data channel via PeerJS).
// Only the first hand-shake goes through the public PeerJS broker; the game data is peer to peer.
const PREFIX = 'obentopon-v1-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L
export const CODE_LEN = 5;

function brokerOptions() {
  // ?peerhost=localhost&peerport=9000 points at a local broker (used by the tests)
  const q = new URLSearchParams(location.search);
  const o = {
    debug: 0,
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] },
  };
  if (q.get('peerhost')) {
    o.host = q.get('peerhost'); o.port = +(q.get('peerport') || 9000); o.path = q.get('peerpath') || '/'; o.secure = location.protocol === 'https:';
  }
  return o;
}

export function makeCode() {
  let c = '';
  const a = new Uint32Array(CODE_LEN); crypto.getRandomValues(a);
  for (const v of a) c += CODE_CHARS[v % CODE_CHARS.length];
  return c;
}
export function cleanCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN); }

export class Link {
  // handlers: onStatus(text), onOpen(), onMessage(msg), onClose(reason)
  constructor(handlers) {
    this.h = handlers;
    this.peer = null;
    this.conn = null;
    this.code = '';
    this.isHost = false;
    this.closed = false;
  }

  get available() { return typeof window.Peer === 'function'; }

  host() {
    this.isHost = true;
    this._open(makeCode());
  }

  _open(code) {
    this.code = code;
    this.h.onStatus?.('つないでいます…');
    const peer = new window.Peer(PREFIX + code, brokerOptions());
    this.peer = peer;
    peer.on('open', () => { if (!this.closed) this.h.onStatus?.('waiting'); });
    peer.on('connection', (conn) => {
      if (this.conn) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
      this._attach(conn);
    });
    peer.on('error', (err) => {
      if (this.closed) return;
      if (err.type === 'unavailable-id') { peer.destroy(); this._open(makeCode()); return; }   // code collision: pick another
      if (err.type === 'peer-unavailable') { this._fail('その部屋コードの部屋が見つかりません'); return; }
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') { this._fail('インターネットにつながらないか、接続サーバーが混んでいます'); return; }
      this._fail('つなげませんでした(' + err.type + ')');
    });
    peer.on('disconnected', () => { if (!this.conn && !this.closed) { try { peer.reconnect(); } catch (e) { /* ignore */ } } });
  }

  join(code) {
    this.isHost = false;
    this.code = code;
    this.h.onStatus?.('さがしています…');
    const peer = new window.Peer(undefined, brokerOptions());
    this.peer = peer;
    peer.on('open', () => {
      if (this.closed) return;
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      this._attach(conn);
      this.joinTimer = setTimeout(() => { if (!this.ready) this._fail('相手につながりませんでした。2台とも同じWi-Fiだとつながりやすくなります'); }, 15000);
    });
    peer.on('error', (err) => {
      if (this.closed) return;
      if (err.type === 'peer-unavailable') this._fail('その部屋コードの部屋が見つかりません');
      else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') this._fail('インターネットにつながらないか、接続サーバーが混んでいます');
      else this._fail('つなげませんでした(' + err.type + ')');
    });
  }

  _attach(conn) {
    this.conn = conn;
    conn.on('open', () => {
      if (this.closed) return;
      this.ready = true;
      clearTimeout(this.joinTimer);
      this.lastHeard = performance.now();
      this.ping = setInterval(() => {
        this.send({ t: 'ping' });
        if (performance.now() - this.lastHeard > 8000) this._fail('相手との接続が切れました');
      }, 1500);
      this.h.onOpen?.();
    });
    conn.on('data', (msg) => {
      this.lastHeard = performance.now();
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'ping') return;
      if (msg.t === 'full') { this._fail('その部屋はもう2人で遊んでいます'); return; }
      this.h.onMessage?.(msg);
    });
    conn.on('close', () => { if (!this.closed) this._fail('相手との接続が切れました'); });
    conn.on('error', () => { if (!this.closed) this._fail('相手との接続が切れました'); });
  }

  send(msg) {
    if (this.conn && this.conn.open) { try { this.conn.send(msg); } catch (e) { /* ignore */ } }
  }

  _fail(reason) {
    if (this.closed) return;
    this.close();
    this.h.onClose?.(reason);
  }

  close() {
    this.closed = true;
    clearInterval(this.ping); clearTimeout(this.joinTimer);
    try { if (this.conn) this.conn.close(); } catch (e) { /* ignore */ }
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
    this.conn = null; this.peer = null;
  }
}
