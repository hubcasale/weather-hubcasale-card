"""Weather Hubcasale: serve la scheda meteo e conserva le sue preferenze (sensori, mappa) per tutti i dispositivi."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import frontend, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

from .const import CARD_FILE, CARD_URL, DOMAIN, EVENT_SETTINGS_UPDATED, STORAGE_KEY, STORAGE_VERSION
from .settings import normalize

_LOGGER = logging.getLogger(__name__)
CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({})}, extra=vol.ALLOW_EXTRA)


def _version() -> str:
    try:
        return json.loads((Path(__file__).parent / "manifest.json").read_text())["version"]
    except (OSError, ValueError, KeyError):
        return "0"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Registra la scheda (servita dall'integrazione) e i comandi per leggere/salvare le preferenze."""
    hass.data.setdefault(DOMAIN, {})
    card_path = Path(__file__).parent / CARD_FILE
    if await hass.async_add_executor_job(card_path.is_file):
        version = await hass.async_add_executor_job(_version)
        await hass.http.async_register_static_paths([StaticPathConfig(CARD_URL, str(card_path), cache_headers=False)])
        frontend.add_extra_js_url(hass, f"{CARD_URL}?v={version}")
    else:
        _LOGGER.warning("Scheda non trovata in %s: costruiscila con npm run build", card_path)
    websocket_api.async_register_command(hass, ws_get_settings)
    websocket_api.async_register_command(hass, ws_set_settings)
    return True


async def _async_store(hass: HomeAssistant) -> tuple[Store, dict[str, Any]]:
    data = hass.data.setdefault(DOMAIN, {})
    if "store" not in data:
        store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        data["store"] = store
        data["settings"] = normalize(await store.async_load())
    return data["store"], data["settings"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    await _async_store(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return True


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get_settings"})
@websocket_api.async_response
async def ws_get_settings(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    _, settings = await _async_store(hass)
    connection.send_result(msg["id"], settings)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/set_settings", vol.Required("settings"): dict})
@websocket_api.async_response
async def ws_set_settings(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Salva le preferenze (valide per tutti i dispositivi) e avvisa le schede aperte."""
    store, _ = await _async_store(hass)
    settings = normalize(msg["settings"])
    hass.data[DOMAIN]["settings"] = settings
    await store.async_save(settings)
    hass.bus.async_fire(EVENT_SETTINGS_UPDATED, {})
    connection.send_result(msg["id"], settings)
