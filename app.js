// Configuration & High-Contrast Palette for Light/Standard Maps
const PALETTE = [
  '#0066FF', // Vibrant Royal Blue
  '#E60049', // Vivid Crimson Red
  '#00A86B', // Jade Emerald Green
  '#8A2BE2', // Deep Purple
  '#FF6B00', // Electric Orange
  '#008080', // Deep Teal
  '#D90429', // Dark Coral Red
  '#6A0DAD'  // Deep Violet
];

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}

// Automatic Room & Identity Resolution
let roomId = window.location.hash.substring(1).trim();
if (!roomId) {
  roomId = 'stanza-' + Math.random().toString(36).substring(2, 8);
  window.location.hash = roomId;
}

const myId = 'user-' + Math.random().toString(36).substring(2, 9);
const myColor = stringToColor(myId);

// Initialize Leaflet Map (Fullscreen, Clear Standard Theme)
const map = L.map('map', {
  zoomControl: false,
  attributionControl: false,
  fadeAnimation: true
}).setView([41.9028, 12.4964], 15); // Initial view

// High performance clear standard tiles (CartoDB Voyager / OpenStreetMap)
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  maxZoom: 20,
  subdomains: 'abcd'
}).addTo(map);

// Data Structures & Tracking State
let myTrail = [];
let myMarker = null;
let myPolyline = null;
let hasInitialGPSFix = false;

let isTracking = true;
let geoWatchId = null;
let simIntervalId = null;
let simLat = 41.9028;
let simLng = 12.4964;
let simAngle = Math.random() * Math.PI * 2;

// Peer Store: peerId -> { color, trail: [[lat, lng]], marker, polyline, isPaused }
const peers = new Map();

// Helper: Create custom animated radar marker
function createMarkerIcon(color, isSelf = false) {
  return L.divIcon({
    className: '',
    html: `
      <div class="user-marker ${isSelf ? 'is-self' : ''}" style="--marker-color: ${color}">
        <div class="user-marker-pulse"></div>
        <div class="user-marker-core"></div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

// Update Local User Location & Past Trail
function updateMyPosition(lat, lng) {
  if (!isTracking) return;

  const coord = [lat, lng];
  
  // Ignore duplicate consecutive points
  if (myTrail.length > 0) {
    const last = myTrail[myTrail.length - 1];
    if (Math.abs(last[0] - lat) < 0.00001 && Math.abs(last[1] - lng) < 0.00001) {
      return;
    }
  }

  myTrail.push(coord);

  // Update or create self marker
  if (!myMarker) {
    myMarker = L.marker(coord, {
      icon: createMarkerIcon(myColor, true),
      zIndexOffset: 1000
    }).addTo(map);
  } else {
    myMarker.setLatLng(coord);
  }

  // Update or create self trail polyline
  if (!myPolyline) {
    myPolyline = L.polyline(myTrail, {
      color: myColor,
      weight: 4,
      opacity: 0.9,
      smoothFactor: 1,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);
  } else {
    myPolyline.setLatLngs(myTrail);
  }

  // Pan to position on first GPS fix
  if (!hasInitialGPSFix) {
    hasInitialGPSFix = true;
    map.setView(coord, 16, { animate: true });
  }

  // Broadcast to Room via MQTT
  broadcast({
    type: 'pos',
    id: myId,
    color: myColor,
    coord: coord,
    time: Date.now()
  });
}

// Update or Create Peer Position & Past Trail
function updatePeerPosition(id, color, coord) {
  if (id === myId) return;

  let peer = peers.get(id);
  if (!peer) {
    peer = {
      color: color || stringToColor(id),
      trail: [],
      marker: null,
      polyline: null,
      isPaused: false
    };
    peers.set(id, peer);
  }

  peer.trail.push(coord);

  // Update or create peer marker
  if (!peer.marker) {
    peer.marker = L.marker(coord, {
      icon: createMarkerIcon(peer.color, false),
      zIndexOffset: 500
    }).addTo(map);
  } else {
    peer.marker.setLatLng(coord);
  }

  // Update or create peer polyline
  if (!peer.polyline) {
    peer.polyline = L.polyline(peer.trail, {
      color: peer.color,
      weight: 3.5,
      opacity: 0.85,
      smoothFactor: 1,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);
  } else {
    peer.polyline.setLatLngs(peer.trail);
  }
}

// Synchronize Full Past Trail for a Peer
function syncPeerTrail(id, color, fullTrail) {
  if (id === myId || !Array.isArray(fullTrail) || fullTrail.length === 0) return;

  let peer = peers.get(id);
  if (!peer) {
    peer = {
      color: color || stringToColor(id),
      trail: [],
      marker: null,
      polyline: null,
      isPaused: false
    };
    peers.set(id, peer);
  }

  peer.trail = fullTrail;
  const lastCoord = fullTrail[fullTrail.length - 1];

  if (!peer.marker) {
    peer.marker = L.marker(lastCoord, {
      icon: createMarkerIcon(peer.color, false),
      zIndexOffset: 500
    }).addTo(map);
  } else {
    peer.marker.setLatLng(lastCoord);
  }

  if (!peer.polyline) {
    peer.polyline = L.polyline(peer.trail, {
      color: peer.color,
      weight: 3.5,
      opacity: 0.85,
      smoothFactor: 1,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);
  } else {
    peer.polyline.setLatLngs(peer.trail);
  }
}

// Real-Time Serverless Network (Public MQTT over WebSockets)
const MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_PREFIX = `geotrack_minimal_v1/${roomId}`;
const MY_TOPIC = `${TOPIC_PREFIX}/${myId}`;
const ROOM_WILDCARD = `${TOPIC_PREFIX}/+`;

const client = mqtt.connect(MQTT_BROKER, {
  clean: true,
  connectTimeout: 5000,
  reconnectPeriod: 2500,
  clientId: myId
});

function broadcast(data) {
  if (client.connected) {
    client.publish(MY_TOPIC, JSON.stringify(data), { qos: 0 });
  }
}

client.on('connect', () => {
  client.subscribe(ROOM_WILDCARD, (err) => {
    if (!err) {
      broadcast({
        type: 'join',
        id: myId,
        color: myColor,
        trail: myTrail,
        tracking: isTracking
      });
    }
  });
});

client.on('message', (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    if (data.id === myId) return;

    if (data.type === 'join') {
      if (myTrail.length > 0) {
        broadcast({
          type: 'sync',
          id: myId,
          color: myColor,
          trail: myTrail,
          tracking: isTracking
        });
      }
      if (data.trail && data.trail.length > 0) {
        syncPeerTrail(data.id, data.color, data.trail);
      }
    } else if (data.type === 'sync') {
      syncPeerTrail(data.id, data.color, data.trail);
    } else if (data.type === 'pos' && data.coord) {
      updatePeerPosition(data.id, data.color, data.coord);
    } else if (data.type === 'status') {
      let peer = peers.get(data.id);
      if (peer && peer.marker) {
        const el = peer.marker.getElement();
        if (el) {
          if (data.tracking === false) {
            el.classList.add('is-paused');
          } else {
            el.classList.remove('is-paused');
          }
        }
      }
    }
  } catch (e) {
    // Ignore malformed packets
  }
});

// Start High Accuracy GPS Tracking
function startGeolocationTracking() {
  if ('geolocation' in navigator) {
    geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        updateMyPosition(lat, lng);
      },
      (err) => {
        console.warn('Geolocation notice:', err.message);
        if (myTrail.length === 0 && !simIntervalId) {
          startDesktopSimulation(41.9028, 12.4964);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    );
  } else {
    startDesktopSimulation(41.9028, 12.4964);
  }
}

// Stop GPS / Desktop simulation
function stopGeolocationTracking() {
  if (geoWatchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
  if (simIntervalId !== null) {
    clearInterval(simIntervalId);
    simIntervalId = null;
  }
}

// Fallback: subtle movement if GPS is unavailable (e.g. desktop testing)
function startDesktopSimulation(baseLat, baseLng) {
  if (simIntervalId) return;

  if (myTrail.length === 0) {
    simLat = baseLat + (Math.random() - 0.5) * 0.005;
    simLng = baseLng + (Math.random() - 0.5) * 0.005;
    updateMyPosition(simLat, simLng);
  }

  simIntervalId = setInterval(() => {
    if (!isTracking) return;
    simAngle += (Math.random() - 0.5) * 0.4;
    simLat += Math.cos(simAngle) * 0.00008;
    simLng += Math.sin(simAngle) * 0.00008;
    updateMyPosition(simLat, simLng);
  }, 3000);
}

// Stop / Resume Button Handling
const toggleBtn = document.getElementById('toggle-tracking-btn');
const btnIcon = document.getElementById('btn-icon');
const btnText = document.getElementById('btn-text');

function updateTrackingButtonUI() {
  if (isTracking) {
    toggleBtn.className = 'tracking-btn tracking-active';
    btnText.textContent = 'STOP Tracking';
    btnIcon.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <rect x="5" y="5" width="14" height="14" rx="2.5" />
      </svg>
    `;
    if (myMarker && myMarker.getElement()) {
      myMarker.getElement().classList.remove('is-paused');
    }
  } else {
    toggleBtn.className = 'tracking-btn tracking-paused';
    btnText.textContent = 'Riprendi Tracking';
    btnIcon.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <polygon points="6,4 20,12 6,20" />
      </svg>
    `;
    if (myMarker && myMarker.getElement()) {
      myMarker.getElement().classList.add('is-paused');
    }
  }
}

if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    isTracking = !isTracking;
    
    if (isTracking) {
      startGeolocationTracking();
    } else {
      stopGeolocationTracking();
    }

    updateTrackingButtonUI();

    // Broadcast tracking status
    broadcast({
      type: 'status',
      id: myId,
      tracking: isTracking
    });
  });
}

// Initial Tracking Boot
startGeolocationTracking();

