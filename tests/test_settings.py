"""Prove della pulizia delle preferenze (modulo senza dipendenze da Home Assistant)."""
import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "wh_settings", Path(__file__).parent.parent / "custom_components" / "weather_hubcasale" / "settings.py"
)
settings = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(settings)


def test_default_has_every_key():
    d = settings.default_settings()
    assert set(d["entities"]) == set(settings.ENTITY_KEYS)
    assert d["map"] == {"enabled": True, "zoom": 7}
    assert d["forecast"] == {"enabled": True}
    assert "weather" in d["entities"]


def test_garbage_input_gives_defaults():
    for bad in (None, 5, "x", [], {"entities": "no", "map": 3}):
        assert settings.normalize(bad) == settings.default_settings()


def test_valid_entities_kept_invalid_dropped():
    out = settings.normalize({"entities": {"temperature": " Sensor.Esterno_Temp ", "humidity": "not an entity", "pressure": 5, "xx": "sensor.a"}})
    assert out["entities"]["temperature"] == "sensor.esterno_temp"
    assert out["entities"]["humidity"] == ""
    assert out["entities"]["pressure"] == ""
    assert "xx" not in out["entities"]


def test_zoom_is_clamped_and_bool_rejected():
    assert settings.normalize({"map": {"zoom": 99}})["map"]["zoom"] == settings.ZOOM_MAX
    assert settings.normalize({"map": {"zoom": 0}})["map"]["zoom"] == settings.ZOOM_MIN
    assert settings.normalize({"map": {"zoom": True}})["map"]["zoom"] == 7
    assert settings.normalize({"map": {"enabled": False}})["map"]["enabled"] is False


def test_title_is_trimmed_and_limited():
    assert settings.normalize({"title": "  Casa  "})["title"] == "Casa"
    assert len(settings.normalize({"title": "x" * 500})["title"]) == settings.TITLE_MAX


def test_normalize_is_idempotent():
    once = settings.normalize({"entities": {"temperature": "sensor.t"}, "map": {"zoom": 9}, "title": "A"})
    assert settings.normalize(once) == once


def test_weather_entity_and_forecast_toggle():
    out = settings.normalize({"entities": {"weather": "Weather.Casa"}, "forecast": {"enabled": False}})
    assert out["entities"]["weather"] == "weather.casa"
    assert out["forecast"]["enabled"] is False
    assert settings.normalize({"forecast": {"enabled": "no"}})["forecast"]["enabled"] is True
