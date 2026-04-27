/**
 * multiplayer.js — Client réseau pour le multijoueur via lien d'invitation.
 *
 * Architecture :
 *   - Le serveur Flask ne joue pas — il relaie les events entre clients (SSE).
 *   - L'hôte est l'autorité : il mélange le deck, calcule l'état dérivé, et
 *     envoie aux autres soit des broadcasts (state public), soit des messages
 *     ciblés `to=<player_id>` (hole cards privées).
 *   - Anti-cheat : le serveur ne voit JAMAIS les hole cards d'un autre joueur
 *     que le destinataire (filtrage par `to` côté SSE).
 */

const API = "/casino/api";

export class NetClient extends EventTarget {
  constructor() {
    super();
    this.code = null;
    this.playerId = null;
    this.isHost = false;
    this.es = null;
    this.lastSeq = 0;
    this.reconnectDelay = 1000;
  }

  /**
   * Crée une room. Renvoie {code, playerId, room}.
   */
  async create(name, opts = {}) {
    const r = await fetch(`${API}/room/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ...opts }),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "Erreur création");
    this.code = data.code;
    this.playerId = data.host_id;
    this.isHost = true;
    this._connectStream();
    return data;
  }

  /**
   * Rejoint une room existante.
   */
  async join(code, name) {
    const r = await fetch(`${API}/room/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "Erreur jonction");
    this.code = code.toUpperCase();
    this.playerId = data.player_id;
    this.isHost = false;
    this._connectStream();
    return data;
  }

  /**
   * Récupère l'état public (sans s'abonner).
   */
  async fetchRoom(code) {
    const r = await fetch(`${API}/room/${code}`);
    return r.json();
  }

  async ready(state = true) {
    return this._post(`/room/${this.code}/ready`, { player_id: this.playerId, ready: state });
  }
  async start() {
    return this._post(`/room/${this.code}/start`, { player_id: this.playerId });
  }
  async leave() {
    if (!this.code || !this.playerId) return;
    try {
      await this._post(`/room/${this.code}/leave`, { player_id: this.playerId });
    } catch (e) { /* ignore */ }
    this._disconnect();
  }

  /**
   * Envoie un message au reste de la room (action ou snapshot d'état).
   * @param {string} type
   * @param {object} payload
   * @param {string|null} to player_id ciblé (privé), ou null = broadcast
   */
  async send(type, payload = {}, to = null) {
    return this._post(`/room/${this.code}/action`, {
      player_id: this.playerId,
      type, payload, to,
    });
  }

  _post(path, body) {
    return fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json());
  }

  _connectStream() {
    if (this.es) try { this.es.close(); } catch {}
    const url = `${API}/room/${this.code}/stream?player_id=${this.playerId}&since=${this.lastSeq}`;
    const es = new EventSource(url);
    this.es = es;
    es.onmessage = (msg) => {
      let data;
      try { data = JSON.parse(msg.data); } catch { return; }
      if (data.seq) this.lastSeq = Math.max(this.lastSeq, data.seq);
      this.dispatchEvent(new CustomEvent("event", { detail: data }));
      if (data.type) {
        this.dispatchEvent(new CustomEvent(data.type, { detail: data }));
      }
    };
    es.onerror = () => {
      // Reconnexion auto avec backoff
      if (es.readyState === EventSource.CLOSED) {
        setTimeout(() => this._connectStream(), this.reconnectDelay);
        this.reconnectDelay = Math.min(30000, this.reconnectDelay * 2);
      }
    };
    es.onopen = () => { this.reconnectDelay = 1000; };
  }

  _disconnect() {
    if (this.es) { try { this.es.close(); } catch {} this.es = null; }
    this.code = null; this.playerId = null;
  }
}

/**
 * Génère le lien d'invitation à partager.
 * Format : `<origin>/casino/#/join/<CODE>`
 */
export function inviteUrl(code) {
  const origin = location.origin;
  return `${origin}/casino/#/join/${code}`;
}
