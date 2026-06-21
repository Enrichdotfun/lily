// Thin, auto-reconnecting PumpPortal data-stream client.
//
// PumpPortal exposes a free, key-less WebSocket that broadcasts pump.fun events.
// We use three subscriptions:
//   subscribeNewToken          -> every new launch
//   subscribeMigration         -> every coin that graduates (bonds) to an AMM
//   subscribeTokenTrade {keys} -> the live trade tape for specific mints
//
// Docs: https://pumpportal.fun/data-api/real-time
import WebSocket from 'ws';

export class PumpPortal {
  /**
   * @param {object} opts
   * @param {string} opts.url
   * @param {boolean} [opts.newToken]   subscribe to new launches
   * @param {boolean} [opts.migration]  subscribe to migrations
   * @param {(msg:object)=>void} opts.onMessage
   * @param {(state:string)=>void} [opts.onState]
   */
  constructor(opts) {
    this.url = opts.url;
    this.wantNewToken = !!opts.newToken;
    this.wantMigration = !!opts.migration;
    this.onMessage = opts.onMessage;
    this.onState = opts.onState || (() => {});
    this.ws = null;
    this.tradeMints = new Set(); // mints we want the trade tape for
    this.backoffMs = 1000;
    this.closed = false;
  }

  start() {
    this.closed = false;
    this._connect();
  }

  stop() {
    this.closed = true;
    try { this.ws?.close(); } catch { /* noop */ }
  }

  /** Begin (or stop) streaming the trade tape for a mint. */
  watchTrades(mint) {
    if (this.tradeMints.has(mint)) return;
    this.tradeMints.add(mint);
    this._send({ method: 'subscribeTokenTrade', keys: [mint] });
  }
  unwatchTrades(mint) {
    if (!this.tradeMints.delete(mint)) return;
    this._send({ method: 'unsubscribeTokenTrade', keys: [mint] });
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify(obj)); } catch { /* noop */ }
    }
  }

  _connect() {
    this.onState('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on('open', () => {
      this.backoffMs = 1000;
      this.onState('open');
      if (this.wantNewToken) this._send({ method: 'subscribeNewToken' });
      if (this.wantMigration) this._send({ method: 'subscribeMigration' });
      // re-arm any per-mint trade subscriptions after a reconnect
      if (this.tradeMints.size) {
        this._send({ method: 'subscribeTokenTrade', keys: [...this.tradeMints] });
      }
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg && typeof msg === 'object' && !msg.message) {
        try { this.onMessage(msg); } catch { /* never let a handler kill the socket */ }
      }
    });

    ws.on('close', () => {
      this.onState('closed');
      if (!this.closed) this._reconnect();
    });
    ws.on('error', () => {
      try { ws.close(); } catch { /* noop */ }
    });
  }

  _reconnect() {
    const wait = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
    setTimeout(() => { if (!this.closed) this._connect(); }, wait);
  }
}
