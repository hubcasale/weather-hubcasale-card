# Weather Hubcasale

Scheda Lovelace per la **stazione meteo personale**, con la grafica a blocchi dei siti delle stazioni (temperatura, umidità, vento, precipitazioni, pressione, UV, radiazione), una **barra temporale** per scorrere la giornata e i giorni precedenti, la **mappa radar** ([Weather Radar Card](https://github.com/Makin-Things/weather-radar-card)) e i **grafici in popup**, un pulsante per ogni grafico.

Si compone di:

- **integrazione** `weather_hubcasale`: serve la scheda (e, per le schede create prima dell'editor, conserva le vecchie preferenze);
- **scheda** `custom:weather-hubcasale-card`: si configura con l'**editor visuale** di Home Assistant (o in YAML).

## Cosa mostra

| Blocco | Contenuto |
|---|---|
| Temperatura | arco colorato e temperatura percepita (calcolata, o il sensore scelto) |
| Umidità | anello e punto di rugiada (calcolato, o il sensore scelto) |
| Vento | bussola, velocità, raffica, direzione in gradi e in punti cardinali |
| Precipitazioni | cilindro, totale del giorno e intensità; con un sensore «sta piovendo» (facoltativo, nell'editor) compare un puntino blu acceso e «Piove ora», altrimenti «Asciutto» (solo nella vista in diretta) |
| Pressione | quadrante e tendenza (variazione nelle ultime 3 ore) |
| UV | piramide a livelli (Basso … Estremo) |
| Radiazione | sole proporzionale ai W/m² |

- **In alto** i blocchi, tutti su una riga, e sotto la **barra temporale** a tutta larghezza: trascina per vedere i valori di un'ora qualsiasi; le frecce passano al giorno prima/dopo; «Adesso» torna ai valori in diretta. I valori storici vengono dal recorder di Home Assistant.
- **Sotto**, a tutta larghezza, due riquadri affiancati: la **mappa radar** ([Weather Radar Card](https://github.com/Makin-Things/weather-radar-card)) e le **previsioni** (Weather Forecast Extended Card (`custom:weather-forecast-extended-card`, da HACS)). Su schermi stretti si impilano.
- **I blocchi senza sensore restano nascosti** (per esempio UV, se non hai il sensore).
- **Grafici** (popup): temperatura e rugiada, umidità, vento e raffica, direzione del vento, precipitazioni, pressione, radiazione e UV. Tocca il grafico per leggere i valori.
- **Vista tablet** (opzione `tablet` dell'editor): con la scheda larga almeno 900 px compare a destra una colonna a tutta altezza con il nome della scheda, il selettore dei giorni e la **barra temporale verticale** (00 in alto, 24 in basso, il cursore sull'ora attuale); a sinistra i blocchi e, sotto, mappa e previsioni occupano tutta l'altezza dello schermo. Sotto i 900 px torna alla vista normale.
- **Layout adattabile**: un solo layout che si riorganizza in base alla larghezza (telefono, tablet, PC), pensato anche per un tablet a muro (bersagli da 44 px, niente hover).

## Installazione (HACS)

1. HACS → ⋮ → *Repository personalizzati* → `https://github.com/hubcasale/weather-hubcasale-card`, categoria **Integrazione**.
2. Scarica *Weather Hubcasale* e riavvia Home Assistant.
3. *Impostazioni → Dispositivi e servizi → Aggiungi integrazione → Weather Hubcasale*.
4. In una plancia aggiungi una scheda *manuale* con `type: custom:weather-hubcasale-card` (la scheda è servita dall'integrazione, non serve aggiungere risorse). In una vista a *pannello* aggiungi `fill_height: true` perché mappa e previsioni occupino tutta l'altezza dello schermo.
5. Apri l'editor della scheda e scegli i sensori (l'editor visuale ha un campo per ogni blocco). Lo stesso si può scrivere in YAML, vedi sotto.

Una scheda creata prima dell'editor, senza `entities`, continua a usare le vecchie preferenze salvate dall'integrazione; la prima modifica dall'editor parte da quelle e salva tutto nella scheda.

Con la scheda aperta su un tablet con Fully Kiosk, dopo un aggiornamento svuota la cache del browser.

### Mappa e previsioni

Le due schede si installano separatamente da HACS (se mancano, la scheda lo segnala al loro posto). Nell'editor scegli l'entità `weather.…` per le previsioni; la temperatura che hai scelto viene usata anche nell'intestazione delle previsioni. Ognuno dei due riquadri si può disattivare.

La mappa usa la [Weather Radar Card](https://github.com/Makin-Things/weather-radar-card). Si centra sulla posizione di casa configurata in Home Assistant: nessuna coordinata è salvata da questa scheda. Lo zoom iniziale si regola dall'editor, e la mappa si può disattivare.

## Configurazione (YAML)

L'editor visuale scrive questa configurazione; si può modificare anche a mano. Tutto è facoltativo tranne `entities`: i blocchi senza sensore restano nascosti.

```yaml
type: custom:weather-hubcasale-card
title: Stazione di casa        # facoltativo
tablet: true                   # vista tablet (colonna a destra con la barra temporale verticale)
fill_height: true              # occupa tutta l'altezza (vista a pannello)
color: indigo                  # colore proprio della scheda: sfondo tinto e bordo, riquadri come sono
pressure_altitude: 579         # quota in m: riporta la pressione di stazione al livello del mare
entities:
  temperature: sensor.temperatura_esterna
  humidity: sensor.umidita_esterna
  dew_point: sensor.punto_di_rugiada        # facoltativo, altrimenti calcolato
  feels_like: sensor.percepita              # facoltativo, altrimenti calcolata
  wind_speed: sensor.anemometro
  wind_gust: sensor.raffica
  wind_direction: sensor.banderuola
  rain_rate: sensor.intensita_pioggia
  rain_day: sensor.pioggia_oggi
  rain_now: binary_sensor.sta_piovendo      # facoltativo
  pressure: sensor.pressione
  uv: sensor.uv                             # facoltativo
  radiation: sensor.radiazione_solare       # facoltativo
  weather: weather.casale                   # previsioni
map: { enabled: true, zoom: 9 }             # facoltativo (predefinito: attiva, zoom 7)
forecast: { enabled: true }                 # facoltativo (predefinito: attive)
```

Con `entities` presente vale solo la configurazione della scheda.

### Dimensioni nella griglia (vista a sezioni)

Dalla scheda **Layout** dell'editor puoi togliere «Usa le dimensioni consigliate» e scegliere liberamente le colonne (da 4 a 12) e le righe (da 5 a 40). Con le righe fisse la scheda riempie l'altezza che le dai: mappa e previsioni si adattano e, se lo spazio non basta, la scheda scorre. Con «Adatta al contenuto» (predefinito) l'altezza segue il contenuto. Con le righe fisse `fill_height` e la vista tablet non forzano più l'altezza dello schermo: conta la griglia.

## Sensori

| Campo dell'editor | Unità attesa |
|---|---|
| Temperatura, percepita, punto di rugiada | °C |
| Umidità | % |
| Vento, raffica | km/h (anche m/s, mph, kn: la percepita li converte) |
| Direzione del vento | gradi (0–360) |
| Intensità / totale del giorno | mm/h e mm (il totale deve ripartire da zero a mezzanotte) |
| Pressione | hPa (se è la pressione di stazione, indica la quota nell'editor: la scheda la riporta al livello del mare) |
| UV | indice UV |
| Radiazione | W/m² |

Se non scegli «percepita» o «punto di rugiada», vengono calcolati (wind chill / indice di calore e formula di Magnus).

## Sviluppo

```bash
npm install
npm run typecheck && npm test      # test della logica (node:test) e tipi
npm run build                      # bundle in custom_components/weather_hubcasale/frontend/ (va committato)
npm run build:dev                  # bundle per dev/index.html (dati finti, senza Home Assistant)
python3 -m pytest tests            # pulizia delle vecchie preferenze (compatibilità)
```

`dev/index.html?w=1080&open=chart:temperature&min=330&day=1&theme=light&uv=0&empty=1&cfg=1` apre la scheda con dati finti per controllare layout e popup a varie larghezze; `cfg=1` usa la configurazione nella scheda invece delle vecchie preferenze, `editor=1` mostra l'editor con un modulo finto.

## Licenza

MIT
