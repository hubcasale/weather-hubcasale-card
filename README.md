# Weather Hubcasale

Scheda Lovelace per la **stazione meteo personale**, con la grafica a blocchi dei siti delle stazioni (temperatura, umidità, vento, precipitazioni, pressione, UV, radiazione), una **barra temporale** per scorrere la giornata e i giorni precedenti, la **mappa radar** ([Weather Radar Card](https://github.com/Makin-Things/weather-radar-card)) e i **grafici in popup**, un pulsante per ogni grafico.

Si compone di:

- **integrazione** `weather_hubcasale`: serve la scheda e conserva le **preferenze** (i sensori scelti) per tutti i dispositivi;
- **scheda** `custom:weather-hubcasale-card`: nessuna configurazione YAML, tutto si sceglie dal pulsante ingranaggio.

## Cosa mostra

| Blocco | Contenuto |
|---|---|
| Temperatura | arco colorato e temperatura percepita (calcolata, o il sensore scelto) |
| Umidità | anello e punto di rugiada (calcolato, o il sensore scelto) |
| Vento | bussola, velocità, raffica, direzione in gradi e in punti cardinali |
| Precipitazioni | cilindro, totale del giorno e intensità |
| Pressione | quadrante e tendenza (variazione nelle ultime 3 ore) |
| UV | piramide a livelli (Basso … Estremo) |
| Radiazione | sole proporzionale ai W/m² |

- **In alto** i blocchi, tutti su una riga, e sotto la **barra temporale** a tutta larghezza: trascina per vedere i valori di un'ora qualsiasi; le frecce (accanto all'ingranaggio) passano al giorno prima/dopo; «Adesso» torna ai valori in diretta. I valori storici vengono dal recorder di Home Assistant.
- **Sotto**, a tutta larghezza, due riquadri affiancati: la **mappa radar** ([Weather Radar Card](https://github.com/Makin-Things/weather-radar-card)) e le **previsioni** (Weather Forecast Extended Card (`custom:weather-forecast-extended-card`, da HACS)). Su schermi stretti si impilano.
- **I blocchi senza sensore restano nascosti** (per esempio UV, se non hai il sensore).
- **Grafici** (popup): temperatura e rugiada, umidità, vento e raffica, direzione del vento, precipitazioni, pressione, radiazione e UV. Tocca il grafico per leggere i valori.
- **Layout adattabile**: un solo layout che si riorganizza in base alla larghezza (telefono, tablet, PC), pensato anche per un tablet a muro (bersagli da 44 px, niente hover).

## Installazione (HACS)

1. HACS → ⋮ → *Repository personalizzati* → `https://github.com/hubcasale/weather-hubcasale-card`, categoria **Integrazione**.
2. Scarica *Weather Hubcasale* e riavvia Home Assistant.
3. *Impostazioni → Dispositivi e servizi → Aggiungi integrazione → Weather Hubcasale*.
4. In una plancia aggiungi una scheda *manuale* con `type: custom:weather-hubcasale-card` (la scheda è servita dall'integrazione, non serve aggiungere risorse).
5. Premi l'ingranaggio e scegli i sensori. Le preferenze valgono per tutti i dispositivi.

Con la scheda aperta su un tablet con Fully Kiosk, dopo un aggiornamento svuota la cache del browser.

### Mappa e previsioni

Le due schede si installano separatamente da HACS (se mancano, la scheda lo segnala al loro posto). Nelle preferenze scegli l'entità `weather.…` per le previsioni; la temperatura che hai scelto viene usata anche nell'intestazione delle previsioni. Ognuno dei due riquadri si può disattivare.

La mappa usa la [Weather Radar Card](https://github.com/Makin-Things/weather-radar-card). Si centra sulla posizione di casa configurata in Home Assistant: nessuna coordinata è salvata da questa scheda. Lo zoom iniziale si regola dalle preferenze, e la mappa si può disattivare.

## Sensori

| Preferenza | Unità attesa |
|---|---|
| Temperatura, percepita, punto di rugiada | °C |
| Umidità | % |
| Vento, raffica | km/h (anche m/s, mph, kn: la percepita li converte) |
| Direzione del vento | gradi (0–360) |
| Intensità / totale del giorno | mm/h e mm (il totale deve ripartire da zero a mezzanotte) |
| Pressione | hPa |
| UV | indice UV |
| Radiazione | W/m² |

Se non scegli «percepita» o «punto di rugiada», vengono calcolati (wind chill / indice di calore e formula di Magnus).

## Sviluppo

```bash
npm install
npm run typecheck && npm test      # test della logica (node:test) e tipi
npm run build                      # bundle in custom_components/weather_hubcasale/frontend/ (va committato)
npm run build:dev                  # bundle per dev/index.html (dati finti, senza Home Assistant)
python3 -m pytest tests            # pulizia delle preferenze
```

`dev/index.html?w=1080&open=settings|chart:temperature&min=330&day=1&theme=light&uv=0&empty=1` apre la scheda con dati finti per controllare layout e popup a varie larghezze.

## Licenza

MIT
