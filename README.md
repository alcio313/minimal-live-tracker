# Live Map Tracker 🛰️

Una web application ultra-minimale e moderna per il tracciamento GPS in tempo reale tra più utenti, senza server dedicato e con zero configurazione.

## ✨ Caratteristiche

- 🗺️ **Mappa a schermo intero**: Rendering vettoriale ad alte prestazioni con tema Dark Matter e zero pulsanti invasivi.
- 📍 **Marker Radar Neon**: Marker personalizzato con animazione glow e colore univoco generato per ogni utente.
- 〰️ **Tracciamento & Scia Polyline**: Disegno continuo del percorso effettuato per ogni partecipante.
- ⚡ **Rete Real-Time Serverless**: Sincronizzazione istantanea e recupero della cronologia di movimento tramite WebSockets / MQTT pubblico.
- 🔒 **Stanze Private**: Condivisione immediata tramite URL Hash (es. `https://dominio/#mia-stanza`).
- 📱 **Mobile-First & PWA-Ready**: Supporto Geolocation API ad alta precisione e layout responsive.

## 🚀 Avvio Rapido

Puoi servire l'applicazione con qualsiasi web server statico locale:

### PowerShell
```powershell
.\serve.ps1
```

### Python
```bash
python -m http.server 8080
```

### Node.js / npx
```bash
npx serve .
```

Apri il browser su [http://localhost:8080](http://localhost:8080) oppure [http://localhost:8080/#stanza-segreta](http://localhost:8080/#stanza-segreta).

## 🛠️ Tecnologie Utilizzate

- **HTML5 & CSS3** (Vanilla, CSS custom properties, animazioni hardware-accelerated)
- **JavaScript (ES6+)**
- **Leaflet.js** & CartoDB Dark Tiles
- **MQTT.js** via WebSockets
