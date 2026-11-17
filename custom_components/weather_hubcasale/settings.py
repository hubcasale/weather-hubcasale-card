"""Preferenze della scheda: valori predefiniti e pulizia dei dati ricevuti (nessuna dipendenza da Home Assistant)."""
from __future__ import annotations

import re
from typing import Any

ENTITY_KEYS = (
    "temperature",
    "feels_like",
    "humidity",
    "dew_point",
    "wind_speed",
    "wind_gust",
    "wind_direction",
    "rain_rate",
    "rain_day",
    "pressure",
    "uv",
    "radiation",
    "weather",
    "rain_now",
)
ENTITY_RE = re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")
ZOOM_MIN, ZOOM_MAX = 3, 12
TITLE_MAX = 60
ALTITUDE_MAX = 5000


def default_settings() -> dict[str, Any]:
    return {
        "title": "",
        "entities": {key: "" for key in ENTITY_KEYS},
        "map": {"enabled": True, "zoom": 7},
        "forecast": {"enabled": True},
        "pressure_altitude": 0,
        "tablet": False,
    }


def normalize(data: Any) -> dict[str, Any]:
    """Restituisce preferenze valide: chiavi sconosciute scartate, entità non valide svuotate, zoom limitato."""
    result = default_settings()
    if not isinstance(data, dict):
        return result
    title = data.get("title")
    if isinstance(title, str):
        result["title"] = title.strip()[:TITLE_MAX]
    entities = data.get("entities")
    if isinstance(entities, dict):
        for key in ENTITY_KEYS:
            value = entities.get(key)
            if isinstance(value, str) and ENTITY_RE.match(value.strip().lower()):
                result["entities"][key] = value.strip().lower()
    map_cfg = data.get("map")
    if isinstance(map_cfg, dict):
        if isinstance(map_cfg.get("enabled"), bool):
            result["map"]["enabled"] = map_cfg["enabled"]
        zoom = map_cfg.get("zoom")
        if isinstance(zoom, (int, float)) and not isinstance(zoom, bool):
            result["map"]["zoom"] = max(ZOOM_MIN, min(ZOOM_MAX, int(zoom)))
    forecast = data.get("forecast")
    if isinstance(forecast, dict) and isinstance(forecast.get("enabled"), bool):
        result["forecast"]["enabled"] = forecast["enabled"]
    altitude = data.get("pressure_altitude")
    if isinstance(altitude, (int, float)) and not isinstance(altitude, bool):
        result["pressure_altitude"] = max(0, min(ALTITUDE_MAX, int(altitude)))
    if isinstance(data.get("tablet"), bool):
        result["tablet"] = data["tablet"]
    return result
