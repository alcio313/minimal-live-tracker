# Live Map Tracker 🛰️

Una web application ultra-veloce, minimale, ad alta accessibilità e moderna per il tracciamento GPS in tempo reale tra gruppi, famiglie, team ed escursionisti. **Completamente serverless**, con **crittografia End-to-End (E2EE)** e zero configurazione.

🔗 **DEMO LIVE**: [https://alcio313.github.io/minimal-live-tracker/](https://alcio313.github.io/minimal-live-tracker/)

---

## ✨ Caratteristiche Principali

- 👥 **Gruppi e Stanze Protette**: Crea o unisciti a stanze tematiche personalizzate (es. `Famiglia`, `Gruppo Escursione`, `Volantini`) tramite link diretto o nome gruppo.
- 🔐 **Crittografia End-to-End (E2EE AES-GCM 256)**: Tutti i dati di posizione, scia storica, nomi utente e stato sono cifrati localmente nel browser prima dell'invio. Nessun dato in chiaro transita sulla rete.
- ♿ **Design ad Alta Accessibilità (Senior-Friendly)**:
  - Grandi pulsanti ad alto contrasto touch-friendly (60px+).
  - Controlli di zoom dedicati a schermo `[+]` e `[—]`.
  - Pulsante circolare di ricentramento rapido della posizione.
  - Marker radar fluorescente ingrandito (48px) con etichetta utente e indicatore "Tu" ad altissima leggibilità.
  - Traccia del percorso spessa (6.5px) con colori ad alto contrasto WCAG.
- 🔊 & 📳 **Feedback Multi-Sensoriale (Suono & Vibrazione)**:
  - Sintesi audio acustica tramite `Web Audio API` (chime armonico ascendente all'avvio, discendente alla pausa).
  - Feedback aptico con vibrazione sequenziale tramite `Vibration API` su smartphone.
- 🔋 **Algoritmo Risparmio Batteria Eco**:
  - Campionamento intelligente con finestra temporale di 15 secondi.
  - Filtro di movimento matematico Haversine (ignora micro-spostamenti < 10 metri).
  - Cache GNSS hardware `maximumAge` per consentire cicli di riposo ottimali al chip GPS.
- 📱 **Progressive Web App (PWA) & Supporto Offline**:
  - Installabile come app nativa a schermo intero su Android e iOS.
  - Service Worker avanzato con cache delle porzioni di mappa già visualizzate e funzionamento autonomo del GPS anche in assenza temporanea di rete.
- 🇪🇺 **Privacy & GDPR Compliant**:
  - Nessun database centrale, archiviazione effimera in memoria volatile (RAM) che svanisce alla chiusura.
  - Zero cookie di profilazione o tracciamento pubblicitario.
  - Informativa sulla privacy trasparente integrata nell'interfaccia.

---

## 🚀 Avvio Rapido

### Utilizzo Online
Apri semplicemente il link della demo: [https://alcio313.github.io/minimal-live-tracker/](https://alcio313.github.io/minimal-live-tracker/)

### Esecuzione in Locale
Poiché l'applicazione sfrutta **WebCrypto API** e **Service Worker**, è necessario avviarla tramite un server HTTP (o in locale su `localhost`):

#### Opzione 1: PowerShell (Server integrato)
```powershell
.\serve.ps1
```
Apri il browser su: `http://localhost:8080/`

#### Opzione 2: Python HTTP Server
```bash
python -m http.server 8080
```

#### Opzione 3: Node.js / npx serve
```bash
npx serve .
```

### 🗺️ Configurazione Chiave CARTO Basemaps (Opzionale)
I server CARTO richiedono una chiave API per l'accesso ai basemap senza watermark. L'applicazione non contiene chiavi hardcoded per prevenire leak di sicurezza. Puoi configurare la tua chiave gratuita nei seguenti modi:

1. **Da interfaccia utente (consigliato su GitHub Pages)**:
   - Clicca sulla barra in alto (partecipanti) -> **"🗺️ Chiave CARTO Basemaps"**.
   - Incolla la tua chiave e clicca **"Salva Chiave"**. La chiave viene salvata esclusivamente nel tuo browser (`localStorage`).
2. **In sviluppo locale (file config.js)**:
   - Copia il template `config.example.js` in `config.js`:
     ```powershell
     cp config.example.js config.js
     ```
   - Inserisci la tua chiave in `config.js` (il file è escluso da Git tramite `.gitignore`).
3. **Tramite URL**:
   - Aggiungi `?carto_key=LA_TUA_CHIAVE` al link della pagina.

> 🔑 Per ottenere una chiave gratuita senza carta di credito, visita [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey).

---

## 🧭 Guida all'Uso

1. **Accesso al Gruppo**:
   - Inserisci il **Nome del Gruppo** (es. `Escursione Monte Bianco`).
   - Scegli una **Password del Gruppo** (chiunque abbia la stessa password potrà decifrare e vedere la posizione degli altri membri).
   - Inserisci il **Tuo Nome** visualizzato.
2. **Condivisione**:
   - Clicca sull'icona della stanza in alto a sinistra per aprire la lista partecipanti e clicca su **"Copia Link del Gruppo"** per invitare i tuoi amici o familiari.
3. **Gestione Tracciamento**:
   - Premi il grande pulsante centrale **"FERMA CONDIVISIONE"** / **"AVVIA CONDIVISIONE"** per mettere in pausa o riprendere la condivisione GPS in qualunque istante.
   - Usa il pulsante mirino per ricentrare istantaneamente la mappa su di te.
4. **Installazione PWA**:
   - Clicca su **"📲 Installa App su Schermo"** all'interno del menu partecipanti per aggiungere l'icona alla schermata home del telefono.

---

## 🔒 Dettagli Tecnici sulla Sicurezza & Crittografia

```
 [ Posizione GPS ] ──► [ JSON Payload ] ──► [ WebCrypto AES-GCM 256 ] ──► [ Cifrato Base64 ]
                                                     ▲
                                            [ PBKDF2 Key Derivation ]
                                            [ 100.000 iterazioni    ]
                                            [ Password + Room Salt  ]
                                                     ▲
                                            [ Parola d'ordine Gruppo ]
```

1. **Derivazione della Chiave (PBKDF2)**:
   - Algoritmo: `PBKDF2` con `HMAC SHA-256`.
   - Iterazioni: **100.000 round**.
   - Salt univoco basato sull'identificativo del gruppo (`geotrack_salt_v1_<roomId>`).
2. **Cifratura del Pacchetto (AES-GCM)**:
   - Cifratura autenticata AES-GCM a 256-bit con IV randomico a 12 byte per ogni singolo pacchetto inviato.
   - Tutti i messaggi MQTT (posizioni, scie storiche, cambi stato, ping heartbeat) transitano esclusivamente come payload binario cifrato.

---

## 📂 Struttura del Progetto

```
minimal-live-tracker/
├── index.html            # Struttura semantica, modali E2EE, partecipanti e privacy
├── app.js                # Logica applicativa, Leaflet, WebCrypto E2EE, MQTT e geolocalizzazione
├── style.css             # Design system responsive, contrasti elevati, token e animazioni
├── sw.js                 # Service Worker PWA, strategie di caching (offline & tile mappe)
├── manifest.json         # Descrittore Progressive Web App (icone, temi e modalità standalone)
├── serve.ps1             # Server HTTP locale rapido per test su localhost
├── generate_icons.ps1    # Script generatore automatico di icone PWA vettoriali
├── icons/                # Icone PWA generate a varie risoluzioni (192px, 512px, maskable, SVG)
└── README.md             # Documentazione completa del progetto
```

---

## 🛠️ Tecnologie Utilizzate

- **HTML5 & CSS3** (Vanilla, CSS Grid & Flexbox, variabili CSS, supporto dark-mode e WCAG)
- **JavaScript (ES6+)** (Vanilla, asincrono, zero dipendenze pesanti)
- **WebCrypto API** (`SubtleCrypto`, AES-GCM 256-bit, PBKDF2)
- **Web Audio API** (Sintesi sonora in tempo reale per feedback acustico)
- **Vibration API** (Pattern di vibrazione aptica su dispositivi mobili)
- **Leaflet.js** (Rendering mappe vettoriali e raster)
- **CartoDB Voyager Basemap Tiles** (Tile chiare ad alto contrasto)
- **MQTT.js over WebSockets** (Broker real-time serverless P2P-like)
- **Service Worker API & Cache Storage** (Architettura offline-first PWA)

---

## 📄 Licenza, Privacy & Attribuzione Mappe

- **Licenza Software**: Rilasciato sotto licenza open source.
- **Privacy & GDPR**: L'applicazione rispetta pienamente i principi di **Privacy by Design** e le normative **GDPR**, non registrando alcun dato su database esterni ed eliminando le posizioni alla chiusura della sessione.
- **Attribuzione Dati Mappe**: Le mappe visualizzate utilizzano dati forniti da **OpenStreetMap** (rilasciati sotto licenza [Open Data Commons Open Database License - ODbL](https://www.openstreetmap.org/copyright)) e tile layer forniti da **CARTO** (sotto i relativi [termini di attribuzione CARTO](https://carto.com/attributions)). L'applicazione include crediti visibili e conformi direttamente sulla mappa.

---

<div align="center">

✨ **Realizzato con Google Antigravity** ✨

</div>