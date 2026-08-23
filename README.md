# Live Map Tracker 🛰️

Una web application ultra-minimale, accessibile e moderna per il tracciamento GPS in tempo reale tra gruppi, famiglie ed escursionisti, **completamente serverless**, con **crittografia End-to-End (E2EE)** e zero configurazione.

🔗 **DEMO LIVE**: [https://alcio313.github.io/minimal-live-tracker/](https://alcio313.github.io/minimal-live-tracker/)

---

## ✨ Caratteristiche Principali

- 👥 **Gruppi e Nomi Personalizzabili**: Scegli il nome del gruppo e il tuo nome direttamente all'avvio della sessione.
- 🔐 **Crittografia End-to-End (E2EE AES-GCM 256)**: Tutti i dati di posizione, scia e nomi sono cifrati localmente nel browser tramite WebCrypto API e PBKDF2 (100.000 iterazioni SHA-256). Nessun testo in chiaro viaggia sulla rete.
- ♿ **Interfaccia ad Alta Accessibilità (Senior-Friendly)**:
  - Grandi pulsanti ad alto contrasto touch-friendly (60px+).
  - Grandi pulsanti di zoom a schermo `[+]` e `[—]`.
  - Pulsante circolare di ricentramento rapido della posizione sotto al controllo di zoom.
  - Marker radar fluorescente ingrandito (48px) con etichetta utente e "Tu" permanente ad altissima leggibilità.
  - Traccia del percorso spessa (6.5px) e marcata.
- 🔊 & 📳 **Feedback Acustico e Vibrazione Aptica**:
  - Suono armonico ascendente sintetizzato al volo (`Web Audio API`) e doppia vibrazione rapida (`Vibration API`) all'avvio della condivisione.
  - Suono discendente e singolo impulso di vibrazione alla messa in pausa.
- 🔋 **Modalità Risparmio Batteria Eco**:
  - Campionamento intelligente ogni 15 secondi.
  - Filtro di movimento matematico Haversine (ignora micro-movimenti < 10 metri).
  - Cache GNSS hardware `maximumAge` per consentire cicli di riposo al chip GPS del telefono.
- 🇪🇺 **GDPR Compliant & Zero Cookie**:
  - Nessun database centrale, dati volatili che svaniscono alla chiusura.
  - Zero cookie di tracciamento o profilazione.
  - Informativa sulla privacy trasparente integrata.
- 🗺️ **Mappe Chiare Standard**: Tile ad alto contrasto CartoDB Voyager su Leaflet.js.
- ⚡ **Rete Real-Time Serverless**: Sincronizzazione istantanea P2P-like tramite protocollo MQTT over WebSockets.

---

## 🛠️ Tecnologie Utilizzate

- **HTML5 & CSS3** (Vanilla, design system ad alta accessibilità, contrasto WCAG)
- **JavaScript (ES6+)**
- **WebCrypto API** (AES-GCM 256-bit + PBKDF2)
- **Web Audio API & Vibration API**
- **Leaflet.js** & CartoDB Voyager Tiles
- **MQTT.js** via WebSockets

---

## Made with Google Antigravity