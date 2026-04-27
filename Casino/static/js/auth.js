/**
 * auth.js — Client API pour l'authentification & profil utilisateur Casino.
 */

const API = "/casino/api";

export async function fetchMe() {
  const r = await fetch(`${API}/me`, { credentials: "same-origin" });
  const d = await r.json();
  return d.user || null;
}

export async function adminLogin(password) {
  const r = await fetch(`${API}/auth/admin-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ password }),
  });
  return r.json();
}

export async function logout() {
  const r = await fetch(`${API}/auth/logout`, {
    method: "POST", credentials: "same-origin",
  });
  return r.json();
}

export async function inviteInfo(iid) {
  const r = await fetch(`${API}/auth/invite/${encodeURIComponent(iid)}`);
  return r.json();
}

export async function redeem(iid, code, name, avatar_seed = 0) {
  const r = await fetch(`${API}/auth/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ invite_id: iid, code, name, avatar_seed }),
  });
  return r.json();
}

/* ── Admin ─────────────────────────────────────────────────── */

export async function listUsers() {
  const r = await fetch(`${API}/admin/users`, { credentials: "same-origin" });
  return r.json();
}
export async function setChips(uid, { delta, set: target, reason }) {
  const r = await fetch(`${API}/admin/users/${uid}/chips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(delta != null ? { delta, reason } : { set: target, reason }),
  });
  return r.json();
}
export async function updateUser(uid, fields) {
  const r = await fetch(`${API}/admin/users/${uid}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(fields),
  });
  return r.json();
}
export async function deleteUser(uid) {
  const r = await fetch(`${API}/admin/users/${uid}`, {
    method: "DELETE", credentials: "same-origin",
  });
  return r.json();
}
export async function createInvite(opts = {}) {
  const r = await fetch(`${API}/admin/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(opts),
  });
  return r.json();
}
export async function listInvites() {
  const r = await fetch(`${API}/admin/invites`, { credentials: "same-origin" });
  return r.json();
}
export async function deleteInvite(iid) {
  const r = await fetch(`${API}/admin/invites/${iid}`, {
    method: "DELETE", credentials: "same-origin",
  });
  return r.json();
}
export async function userLog(uid) {
  const r = await fetch(`${API}/admin/users/${uid}/log`, { credentials: "same-origin" });
  return r.json();
}

/* ── Self ──────────────────────────────────────────────────── */
export async function cashout(delta, reason = "Solo") {
  const r = await fetch(`${API}/chips/cashout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ delta, reason }),
  });
  return r.json();
}
