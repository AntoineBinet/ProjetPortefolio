"""TYLA Maison — adaptateurs devices.

Architecture en interface uniforme : chaque adaptateur expose la même API
`Adapter.execute(action, params)` et `Adapter.get_status()`. Cela rend trivial
d'ajouter un nouveau type d'appareil.

Adaptateurs implémentés :
    - TuyaBulbAdapter   : ampoules / bandeaux Tuya / Smart Life (LAN, sans cloud)
    - TuyaPlugAdapter   : prises Tuya / Smart Life (on/off + énergie si dispo)
    - RoborockAdapter   : aspirateur Roborock — stub avec hooks (à connecter)
    - DenonAdapter      : barre de son Denon HEOS — stub avec hooks (à connecter)
    - SiemensAdapter    : projecteur Siemens — stub avec hooks PJLink/HTTP
    - GenericWebhookAdapter : webhook on/off pour tout device pilotable en HTTP

Toutes les ops sont synchrones avec timeouts courts pour ne pas bloquer le
serveur Flask. La résolution est délibérément résiliente : si la lib externe
n'est pas installée, l'adaptateur renvoie une erreur explicite mais ne lève
pas d'exception qui ferait planter le process.
"""
from __future__ import annotations

import json
import socket
import time
import urllib.parse
import urllib.request
from typing import Any, Optional

# tinytuya est optionnel : si absent, on désactive proprement les actions
# Tuya tout en gardant le reste de l'app fonctionnel.
try:
    import tinytuya
    _HAS_TINYTUYA = True
except Exception:
    tinytuya = None  # type: ignore
    _HAS_TINYTUYA = False


SUPPORTED_TYPES = {
    "tuya_bulb",
    "tuya_plug",
    "roborock",
    "denon",
    "siemens",
    "generic",
}


# ── Helpers ──────────────────────────────────────────────────────

def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _hex_to_rgb(hexcolor: str) -> tuple[int, int, int]:
    s = hexcolor.lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        raise ValueError("Couleur hex invalide")
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


def _rgb_to_hsv(r: int, g: int, b: int) -> tuple[int, int, int]:
    """RGB 0-255 → HSV (h: 0-360, s: 0-1000, v: 0-1000) façon Tuya."""
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    cmax, cmin = max(rf, gf, bf), min(rf, gf, bf)
    diff = cmax - cmin
    if diff == 0:
        h = 0.0
    elif cmax == rf:
        h = (60 * ((gf - bf) / diff) + 360) % 360
    elif cmax == gf:
        h = (60 * ((bf - rf) / diff) + 120) % 360
    else:
        h = (60 * ((rf - gf) / diff) + 240) % 360
    s = 0 if cmax == 0 else (diff / cmax)
    v = cmax
    return int(round(h)), int(round(s * 1000)), int(round(v * 1000))


# ── Base ────────────────────────────────────────────────────────

class BaseAdapter:
    """Interface commune. `execute` retourne (state_dict, online_bool, error_str)."""

    def __init__(self, config: dict):
        self.config = config or {}

    def supported_actions(self) -> list[str]:
        return []

    def execute(self, action: str, params: dict) -> tuple[dict, bool, str]:
        return {}, False, f"Action inconnue : {action}"

    def get_status(self) -> tuple[dict, bool, str]:
        return {}, False, "get_status non implémenté"

    def discover_metadata(self) -> dict:
        return {}


# ── TUYA bulb ────────────────────────────────────────────────────

class TuyaBulbAdapter(BaseAdapter):
    """Pilote une ampoule Tuya / Smart Life en LAN.

    Config attendue :
      - device_id (str)
      - ip (str)
      - local_key (str)
      - version (float, défaut 3.3 — utiliser 3.4/3.5 selon le firmware)
      - dim_dp (int, défaut 22) — DP brightness selon le modèle
      - color_dp (int, défaut 24) — DP color HSV
      - temp_dp (int, défaut 23) — DP température
    """

    def supported_actions(self) -> list[str]:
        return [
            "turn_on", "turn_off", "toggle",
            "set_brightness", "set_color", "set_color_temp",
            "set_white",
        ]

    def _device(self):
        if not _HAS_TINYTUYA:
            raise RuntimeError(
                "tinytuya non installé — `pip install tinytuya` requis"
            )
        device_id = (self.config.get("device_id") or "").strip()
        ip = (self.config.get("ip") or "").strip()
        local_key = (self.config.get("local_key") or "").strip()
        if not (device_id and ip and local_key):
            raise RuntimeError(
                "Config Tuya incomplète : device_id, ip, local_key requis"
            )
        version = float(self.config.get("version") or 3.3)
        d = tinytuya.BulbDevice(device_id, ip, local_key)
        d.set_version(version)
        d.set_socketTimeout(3)
        d.set_socketRetryLimit(1)
        return d

    def get_status(self) -> tuple[dict, bool, str]:
        try:
            d = self._device()
            data = d.status() or {}
            # tinytuya renvoie {"Error": "...", "Err": "..."} sur timeout sans
            # lever d'exception — il faut détecter ce cas explicitement.
            if isinstance(data, dict) and data.get("Error"):
                return {}, False, str(data.get("Error"))[:200]
            dps = data.get("dps") or {}
            if not dps:
                return {}, False, "Aucune donnée reçue (timeout ou device non joignable)"
            state = self._dps_to_state(dps)
            return state, True, ""
        except Exception as e:
            return {}, False, str(e)[:200]

    def _dps_to_state(self, dps: dict) -> dict:
        """Mappe les DP brutes Tuya en état logique."""
        state = {"power": bool(dps.get("1") or dps.get("20"))}
        # mode peut être white / colour / scene / music
        mode = dps.get("21") or dps.get("2")
        if mode:
            state["mode"] = str(mode)
        # brightness DP 22 (white) ou 3 (variation modèles plus anciens)
        bright = dps.get(str(self.config.get("dim_dp") or 22)) or dps.get("3")
        if bright is not None:
            try:
                state["brightness"] = int(bright)
            except Exception:
                pass
        # temp DP 23
        temp = dps.get(str(self.config.get("temp_dp") or 23)) or dps.get("4")
        if temp is not None:
            try:
                state["color_temp"] = int(temp)
            except Exception:
                pass
        # color DP 24 — chaîne hex HSV "0000000000000000" ou "HHHHSSSSVVVV"
        color = dps.get(str(self.config.get("color_dp") or 24)) or dps.get("5")
        if color:
            state["color_raw"] = str(color)
            try:
                # Format Tuya v3.3+ : "HHHHSSSSVVVV" (12 hex chars, h en 360, s/v en 1000)
                if isinstance(color, str) and len(color) >= 12:
                    h = int(color[0:4], 16)
                    s = int(color[4:8], 16)
                    v = int(color[8:12], 16)
                    state["color_hsv"] = {"h": h, "s": s, "v": v}
            except Exception:
                pass
        return state

    def execute(self, action: str, params: dict) -> tuple[dict, bool, str]:
        params = params or {}
        try:
            d = self._device()
        except Exception as e:
            return {}, False, str(e)[:200]
        try:
            if action == "turn_on":
                d.turn_on()
            elif action == "turn_off":
                d.turn_off()
            elif action == "toggle":
                cur = d.status() or {}
                is_on = bool((cur.get("dps") or {}).get("1"))
                if is_on:
                    d.turn_off()
                else:
                    d.turn_on()
            elif action == "set_brightness":
                # 0-100 → DP 22 entre 10 et 1000 (les Tuya ne descendent pas
                # à 0 sans s'éteindre)
                pct = int(_clamp(int(params.get("brightness", 100)), 0, 100))
                if pct == 0:
                    d.turn_off()
                else:
                    val = int(round(10 + (pct / 100) * 990))
                    dim_dp = int(self.config.get("dim_dp") or 22)
                    d.set_value(dim_dp, val, nowait=False)
                    # S'assurer qu'on est en mode white pour que le DP s'applique
                    try:
                        d.set_mode("white")
                    except Exception:
                        pass
                    if not d.cached_status().get("dps", {}).get("1"):
                        d.turn_on()
            elif action == "set_white":
                # Mode blanc (sans couleur), avec brightness optionnelle
                try:
                    d.set_mode("white")
                except Exception:
                    pass
                if params.get("brightness") is not None:
                    return self.execute("set_brightness", params)
                if not d.cached_status().get("dps", {}).get("1"):
                    d.turn_on()
            elif action == "set_color_temp":
                # 0-100 (chaud→froid) → DP 23 entre 0 et 1000
                pct = int(_clamp(int(params.get("color_temp", 50)), 0, 100))
                val = int(round((pct / 100) * 1000))
                temp_dp = int(self.config.get("temp_dp") or 23)
                try:
                    d.set_mode("white")
                except Exception:
                    pass
                d.set_value(temp_dp, val, nowait=False)
                if not d.cached_status().get("dps", {}).get("1"):
                    d.turn_on()
            elif action == "set_color":
                hexcolor = params.get("hex") or params.get("color") or "#ffffff"
                r, g, b = _hex_to_rgb(hexcolor)
                # tinytuya gère ça nativement si on passe par set_colour
                try:
                    d.set_colour(r, g, b, nowait=False)
                except Exception:
                    # Fallback manuel : DP 24 HSV
                    h, s, v = _rgb_to_hsv(r, g, b)
                    raw = f"{h:04x}{s:04x}{v:04x}"
                    color_dp = int(self.config.get("color_dp") or 24)
                    d.set_mode("colour")
                    d.set_value(color_dp, raw, nowait=False)
                if not d.cached_status().get("dps", {}).get("1"):
                    d.turn_on()
            else:
                return {}, False, f"Action inconnue : {action}"

            # Refresh status après l'action (court timeout)
            time.sleep(0.15)
            data = d.status() or {}
            state = self._dps_to_state(data.get("dps") or {})
            return state, True, ""
        except Exception as e:
            return {}, False, str(e)[:200]


# ── TUYA plug (prise) ───────────────────────────────────────────

class TuyaPlugAdapter(BaseAdapter):
    """Pilote une prise Tuya (on/off + lecture énergie sur DP 18-21)."""

    def supported_actions(self) -> list[str]:
        return ["turn_on", "turn_off", "toggle"]

    def _device(self):
        if not _HAS_TINYTUYA:
            raise RuntimeError("tinytuya non installé")
        device_id = (self.config.get("device_id") or "").strip()
        ip = (self.config.get("ip") or "").strip()
        local_key = (self.config.get("local_key") or "").strip()
        if not (device_id and ip and local_key):
            raise RuntimeError("Config incomplète")
        version = float(self.config.get("version") or 3.3)
        d = tinytuya.OutletDevice(device_id, ip, local_key)
        d.set_version(version)
        d.set_socketTimeout(3)
        d.set_socketRetryLimit(1)
        return d

    def get_status(self) -> tuple[dict, bool, str]:
        try:
            d = self._device()
            data = d.status() or {}
            if isinstance(data, dict) and data.get("Error"):
                return {}, False, str(data.get("Error"))[:200]
            dps = data.get("dps") or {}
            if not dps:
                return {}, False, "Aucune donnée reçue (timeout ou device non joignable)"
            state = {"power": bool(dps.get("1"))}
            # DPs énergie communs : 18 current(mA), 19 power(W*10), 20 voltage(V*10)
            for dp_id, key, scale in (("18", "current_mA", 1.0),
                                      ("19", "power_W", 0.1),
                                      ("20", "voltage_V", 0.1)):
                if dp_id in dps:
                    try:
                        state[key] = round(float(dps[dp_id]) * scale, 1)
                    except Exception:
                        pass
            return state, True, ""
        except Exception as e:
            return {}, False, str(e)[:200]

    def execute(self, action: str, params: dict) -> tuple[dict, bool, str]:
        try:
            d = self._device()
            if action == "turn_on":
                d.turn_on()
            elif action == "turn_off":
                d.turn_off()
            elif action == "toggle":
                cur = d.status() or {}
                if (cur.get("dps") or {}).get("1"):
                    d.turn_off()
                else:
                    d.turn_on()
            else:
                return {}, False, f"Action inconnue : {action}"
            time.sleep(0.1)
            return self.get_status()
        except Exception as e:
            return {}, False, str(e)[:200]


# ── Roborock (stub) ──────────────────────────────────────────────

class RoborockAdapter(BaseAdapter):
    """Stub Roborock. Implémentation prévue : python-miio (modèles legacy)
    ou roborock-api (cloud, modèles récents S7/Q7+ etc).

    Config attendue (à terme) :
      - ip, token (Mi Home v1) — OU username, password, region (cloud v2)
      - model
    """

    def supported_actions(self) -> list[str]:
        return ["start_clean", "stop_clean", "pause", "return_dock",
                "find_robot", "set_fan_speed", "spot_clean"]

    def get_status(self) -> tuple[dict, bool, str]:
        # TODO: connecter via python-miio ou roborock-api
        return {
            "power": False,
            "battery": None,
            "state": "stub",
            "fan_speed": None,
        }, False, "Adaptateur Roborock non encore connecté (stub)."

    def execute(self, action: str, params: dict) -> tuple[dict, bool, str]:
        return {}, False, (
            "Adaptateur Roborock pas encore branché. "
            "À implémenter via python-miio (legacy) ou roborock-api (récent)."
        )


# ── Denon HEOS (stub) ────────────────────────────────────────────

class DenonAdapter(BaseAdapter):
    """Stub Denon HEOS. Implémentation prévue : protocole HEOS sur TCP 1255
    (lib `pyheos`) ou télnet AVR sur TCP 23.

    Config attendue (à terme) :
      - ip
      - protocol ('heos' ou 'avr_telnet')
    """

    def supported_actions(self) -> list[str]:
        return ["turn_on", "turn_off", "volume_up", "volume_down", "set_volume",
                "mute", "play", "pause", "next", "previous", "set_input"]

    def get_status(self) -> tuple[dict, bool, str]:
        ip = (self.config.get("ip") or "").strip()
        if not ip:
            return {}, False, "IP requise"
        # Tentative ping TCP 1255 (HEOS) — si ouvert, on considère online
        try:
            with socket.create_connection((ip, 1255), timeout=1.5):
                return {"power": None, "reachable": True}, True, (
                    "HEOS port 1255 ouvert — adaptateur encore stub, "
                    "lecture/écriture à brancher (lib pyheos)"
                )
        except Exception:
            pass
        # Sinon AVR Telnet
        try:
            with socket.create_connection((ip, 23), timeout=1.5):
                return {"power": None, "reachable": True}, True, (
                    "AVR Telnet port 23 ouvert — adaptateur encore stub"
                )
        except Exception as e:
            return {}, False, f"Injoignable ({e})"[:200]

    def execute(self, action: str, params: dict) -> tuple[dict, bool, str]:
        return {}, False, (
            "Adaptateur Denon pas encore branché. "
            "À implémenter via pyheos (HEOS) ou commandes Telnet AVR."
        )


# ── Siemens projector (stub PJLink) ──────────────────────────────

class SiemensAdapter(BaseAdapter):
    """Stub Siemens projector — la plupart parlent PJLink (TCP 4352) ou
    HTTP API propriétaire selon le modèle.

    Config attendue (à terme) :
      - ip
      - pjlink_password (optionnel)
      - model (référence modèle pour adapter le set d'inputs)
    """

    def supported_actions(self) -> list[str]:
        return ["turn_on", "turn_off", "set_input", "mute_video", "mute_audio"]

    def get_status(self) -> tuple[dict, bool, str]:
        ip = (self.config.get("ip") or "").strip()
        if not ip:
            return {}, False, "IP requise"
        try:
            with socket.create_connection((ip, 4352), timeout=1.5):
                return {"power": None, "reachable": True}, True, (
                    "PJLink port 4352 ouvert — adaptateur encore stub"
                )
        except Exception as e:
            return {}, False, f"Injoignable PJLink ({e})"[:200]

    def execute(self, action: str, params: dict) -> tuple[dict, bool, str]:
        return {}, False, (
            "Adaptateur Siemens pas encore branché. "
            "À implémenter via PJLink (cmds POWR / INPT)."
        )


# ── Generic webhook ──────────────────────────────────────────────

class GenericWebhookAdapter(BaseAdapter):
    """Adaptateur fallback : déclenche un webhook HTTP pour chaque action.

    Config attendue :
      - actions : { "turn_on": "https://...", "turn_off": "https://..." }
      - method : "POST" (défaut) ou "GET"
      - body_template : optionnel, payload pour POST
      - timeout : secondes (défaut 5)
    """

    def supported_actions(self) -> list[str]:
        return list((self.config.get("actions") or {}).keys()) or ["turn_on", "turn_off"]

    def get_status(self) -> tuple[dict, bool, str]:
        # Pas de polling sur un webhook générique — on considère online si
        # au moins une URL est définie.
        actions = self.config.get("actions") or {}
        if not actions:
            return {}, False, "Aucune URL configurée"
        return {"power": None, "type": "webhook"}, True, ""

    def execute(self, action: str, params: dict) -> tuple[dict, bool, str]:
        actions = self.config.get("actions") or {}
        url = actions.get(action)
        if not url:
            return {}, False, f"Aucune URL pour l'action {action}"
        method = (self.config.get("method") or "POST").upper()
        timeout = float(self.config.get("timeout") or 5.0)
        try:
            data = None
            headers = {"User-Agent": "TylaMaison/1.0"}
            if method == "POST":
                body = self.config.get("body_template") or ""
                if body:
                    body = body.replace("{action}", action)
                    for k, v in (params or {}).items():
                        body = body.replace("{" + k + "}", str(v))
                    data = body.encode("utf-8")
                    headers["Content-Type"] = "application/json"
                else:
                    data = b""
            elif method == "GET" and params:
                # Encode params en query string
                qs = urllib.parse.urlencode(params)
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}{qs}"
            req = urllib.request.Request(url, data=data, method=method, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                code = resp.getcode()
                if 200 <= code < 300:
                    return {"power": None, "last_action": action}, True, ""
                return {}, False, f"HTTP {code}"
        except Exception as e:
            return {}, False, str(e)[:200]


# ── Factory ──────────────────────────────────────────────────────

def get_adapter(device_type: str, config: dict) -> BaseAdapter:
    """Retourne l'adaptateur correspondant au type. Pour un type inconnu,
    retourne un BaseAdapter qui renvoie systématiquement une erreur."""
    t = (device_type or "").lower()
    if t == "tuya_bulb":
        return TuyaBulbAdapter(config)
    if t == "tuya_plug":
        return TuyaPlugAdapter(config)
    if t == "roborock":
        return RoborockAdapter(config)
    if t == "denon":
        return DenonAdapter(config)
    if t == "siemens":
        return SiemensAdapter(config)
    if t == "generic":
        return GenericWebhookAdapter(config)
    return BaseAdapter(config)


# ── Discovery (broadcast LAN Tuya) ───────────────────────────────

def discover_tuya_devices(timeout: int = 6) -> list[dict]:
    """Scan UDP broadcast Tuya — retourne la liste des devices détectés.

    Note : le scan ne donne PAS le `local_key` — il faut l'extraire séparément
    via le compte Tuya IoT (cf. doc tinytuya wizard) ou via Smart Life.
    """
    if not _HAS_TINYTUYA:
        return []
    try:
        # tinytuya.deviceScan retourne {ip: {ip, gwId, productKey, version}}
        found = tinytuya.deviceScan(verbose=False, maxretry=1, color=False) or {}
    except Exception:
        return []
    out = []
    for ip, info in (found or {}).items():
        if not isinstance(info, dict):
            continue
        out.append({
            "ip": ip,
            "device_id": info.get("gwId") or info.get("id") or "",
            "product_key": info.get("productKey") or "",
            "version": info.get("version") or "",
            "name": info.get("name") or "",
        })
    return out


def has_tinytuya() -> bool:
    return _HAS_TINYTUYA


def adapter_capabilities(device_type: str) -> dict:
    """Métadonnées pour l'UI : actions supportées + champs config attendus."""
    cap = {
        "tuya_bulb": {
            "label": "Ampoule TUYA / Smart Life",
            "actions": ["turn_on", "turn_off", "toggle", "set_brightness",
                        "set_color", "set_color_temp", "set_white"],
            "config_fields": [
                {"name": "device_id", "label": "Device ID", "required": True,
                 "hint": "20 caractères, visible dans Smart Life ou tinytuya wizard"},
                {"name": "ip", "label": "Adresse IP locale", "required": True,
                 "hint": "Souvent 192.168.x.x — doit être joignable depuis le serveur"},
                {"name": "local_key", "label": "Local key", "required": True,
                 "hint": "16 caractères, à récupérer via tinytuya wizard (compte iot.tuya.com)",
                 "secret": True},
                {"name": "version", "label": "Version protocole",
                 "default": 3.3, "hint": "3.3 par défaut — 3.4 ou 3.5 pour firmwares récents"},
            ],
        },
        "tuya_plug": {
            "label": "Prise TUYA / Smart Life",
            "actions": ["turn_on", "turn_off", "toggle"],
            "config_fields": [
                {"name": "device_id", "required": True},
                {"name": "ip", "required": True},
                {"name": "local_key", "required": True, "secret": True},
                {"name": "version", "default": 3.3},
            ],
        },
        "roborock": {
            "label": "Aspirateur Roborock",
            "actions": ["start_clean", "stop_clean", "pause", "return_dock",
                        "find_robot", "set_fan_speed", "spot_clean"],
            "config_fields": [
                {"name": "ip", "required": True,
                 "hint": "IP locale du robot"},
                {"name": "token", "required": True, "secret": True,
                 "hint": "Token Mi Home (extrait via Mi Home Mod ou outil dédié)"},
                {"name": "model",
                 "hint": "Ex : roborock.vacuum.s5, roborock.vacuum.s7"},
            ],
            "note": "Adaptateur en stub — branchement python-miio prévu.",
        },
        "denon": {
            "label": "Barre de son / AVR Denon",
            "actions": ["turn_on", "turn_off", "volume_up", "volume_down",
                        "set_volume", "mute", "play", "pause", "next",
                        "previous", "set_input"],
            "config_fields": [
                {"name": "ip", "required": True},
                {"name": "protocol", "default": "heos",
                 "hint": "heos (TCP 1255) ou avr_telnet (TCP 23)"},
            ],
            "note": "Adaptateur en stub — pyheos prévu.",
        },
        "siemens": {
            "label": "Projecteur Siemens",
            "actions": ["turn_on", "turn_off", "set_input",
                        "mute_video", "mute_audio"],
            "config_fields": [
                {"name": "ip", "required": True},
                {"name": "pjlink_password", "secret": True,
                 "hint": "Si protégé par PJLink — laisser vide sinon"},
                {"name": "model",
                 "hint": "Référence modèle (info uniquement)"},
            ],
            "note": "Adaptateur en stub — PJLink prévu.",
        },
        "generic": {
            "label": "Webhook générique",
            "actions": ["turn_on", "turn_off"],
            "config_fields": [
                {"name": "actions", "type": "json",
                 "hint": '{"turn_on": "https://...", "turn_off": "https://..."}'},
                {"name": "method", "default": "POST"},
                {"name": "body_template", "type": "textarea",
                 "hint": 'Template, ex : {"action":"{action}"}'},
                {"name": "timeout", "default": 5},
            ],
        },
    }
    return cap.get((device_type or "").lower(), {})


def all_capabilities() -> dict:
    return {t: adapter_capabilities(t) for t in SUPPORTED_TYPES}
