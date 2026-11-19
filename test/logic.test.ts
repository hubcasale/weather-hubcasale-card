import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPASS_TICKS, rainGaugeMax, dewPoint, feelsLike, windCardinal, pressureTrend, uvLevel, tempColor, valueAt, parseHistory, downsample, fmt, isRainingState, dayStart, addDays, minutesToTs, niceTicks, seaLevelPressure } from "../src/logic";

const near = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} non vicino a ${b}`);

test("punto di rugiada: valori noti", () => {
  near(dewPoint(20, 50), 9.3, 0.2);
  near(dewPoint(10, 100), 10, 0.05);
  near(dewPoint(0, 80), -3.0, 0.2);
});

test("temperatura percepita: wind chill, caldo, neutro", () => {
  near(feelsLike(0, 70, 20), -5.2, 0.4);        // wind chill
  near(feelsLike(15, 60, 20), 15, 0.001);      // intermedio: invariata
  assert.ok(feelsLike(32, 70, 5) > 36);       // indice di calore
  near(feelsLike(5, 80, 3), 5, 0.001);         // vento troppo debole
});

test("direzione del vento in sedici punti", () => {
  assert.equal(windCardinal(0), "N");
  assert.equal(windCardinal(90), "E");
  assert.equal(windCardinal(247), "OSO");
  assert.equal(windCardinal(359), "N");
  assert.equal(windCardinal(-10), "N");
});

test("fondo scala fisso del recipiente delle precipitazioni", () => {
  assert.equal(rainGaugeMax("mm"), 50);
  assert.equal(rainGaugeMax(" MM "), 50);
  assert.equal(rainGaugeMax("in"), 2);
  assert.equal(rainGaugeMax("cm"), 5);
  assert.equal(rainGaugeMax(""), 50);
});

test("asse del grafico della direzione: punti cardinali ogni 45 gradi, da N a N", () => {
  assert.deepEqual(COMPASS_TICKS.map((t) => t.label), ["N", "NE", "E", "SE", "S", "SO", "O", "NO", "N"]);
  assert.deepEqual(COMPASS_TICKS.map((t) => t.v), [0, 45, 90, 135, 180, 225, 270, 315, 360]);
});

test("tendenza della pressione", () => {
  assert.equal(pressureTrend(2), "up");
  assert.equal(pressureTrend(-1.5), "down");
  assert.equal(pressureTrend(0.2), "steady");
  assert.equal(pressureTrend(null), "");
});

test("livelli UV", () => {
  assert.equal(uvLevel(0).label, "Basso");
  assert.equal(uvLevel(4).label, "Moderato");
  assert.equal(uvLevel(7).label, "Alto");
  assert.equal(uvLevel(9).label, "Molto alto");
  assert.equal(uvLevel(12).label, "Estremo");
});

test("colore della scala temperatura: estremi e continuita'", () => {
  assert.equal(tempColor(-100), tempColor(-15));
  assert.equal(tempColor(100), tempColor(40));
  assert.match(tempColor(20), /^rgb\(\d+,\d+,\d+\)$/);
  assert.notEqual(tempColor(0), tempColor(30));
});

test("valore a un istante: ultimo campione non successivo", () => {
  const s = [{ ts: 100, v: 1 }, { ts: 200, v: 2 }, { ts: 300, v: 3 }];
  assert.equal(valueAt(s, 50), null);
  assert.equal(valueAt(s, 100), 1);
  assert.equal(valueAt(s, 250), 2);
  assert.equal(valueAt(s, 999), 3);
  assert.equal(valueAt([], 5), null);
  assert.equal(valueAt(undefined, 5), null);
});

test("lettura dello storico compresso e ordinamento", () => {
  const rows = [{ s: "3.5", lu: 20 }, { s: "unavailable", lu: 15 }, { s: "1.5", lu: 10 }, { state: "7", last_updated: "2026-11-15T10:00:00Z" }];
  const out = parseHistory(rows);
  assert.deepEqual(out.map((p) => p.v), [1.5, 3.5, 7]);
  assert.ok(out[0].ts < out[1].ts && out[1].ts < out[2].ts);
  assert.equal(out[0].ts, 10000);
  assert.deepEqual(parseHistory(undefined), []);
});

test("riduzione dei punti", () => {
  const s = Array.from({ length: 1000 }, (_, i) => ({ ts: i, v: i }));
  const d = downsample(s, 100);
  assert.equal(d.length, 100);
  assert.ok(d[0].v < d[99].v);
  assert.equal(downsample(s.slice(0, 10), 100).length, 10);
});

test("formattazione con virgola", () => {
  assert.equal(fmt(7.43), "7,4");
  assert.equal(fmt(null), "–");
  assert.equal(fmt(NaN), "–");
  assert.equal(fmt(12, 0), "12");
});

test("giorni e minuti locali", () => {
  const t = new Date(2026, 10, 15, 14, 30).getTime();
  const d = dayStart(t);
  assert.equal(new Date(d).getHours(), 0);
  assert.equal(new Date(addDays(d, 1)).getDate(), 16);
  assert.equal(new Date(minutesToTs(d, 90)).getHours(), 1);
  assert.equal(new Date(minutesToTs(d, 90)).getMinutes(), 30);
});

test("tacche dell'asse tonde", () => {
  assert.deepEqual(niceTicks(0, 100, 5), [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(niceTicks(-3, 18, 5), [0, 5, 10, 15]);
  const t = niceTicks(-3.2, 17.9, 5);
  assert.ok(t.every((v) => v >= -3.2 && v <= 17.9));
  assert.ok(t.length >= 3 && t.length <= 8);
  assert.deepEqual(niceTicks(5, 5), [5]);
});

test("pressione al livello del mare", () => {
  near(seaLevelPressure(950, 15, 520), 1010, 1.5);
  near(seaLevelPressure(950, 7, 579), 1019, 3);
  assert.equal(seaLevelPressure(950, 15, 0), 950);
  near(seaLevelPressure(1013.25, 15, 0), 1013.25, 0.001);
  assert.ok(seaLevelPressure(950, null, 500) > 950);
});

test("sensore sta piovendo: stati riconosciuti", () => {
  assert.equal(isRainingState("on"), true);
  assert.equal(isRainingState("Rain"), true);
  assert.equal(isRainingState("off"), false);
  assert.equal(isRainingState("0"), false);
  assert.equal(isRainingState("0.4"), true);
  assert.equal(isRainingState("unavailable"), null);
  assert.equal(isRainingState(undefined), null);
});
