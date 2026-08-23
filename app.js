// Configuration & Palette
const PALETTE = [
  '#00f0ff', // Electric Cyan
  '#ff007f', // Neon Pink
  '#00ff88', // Emerald Green
  '#ffb703', // Amber Gold
  '#a855f7', // Vivid Purple
  '#ff5400', // Bright Orange
  '#4cc9f0', // Sky Blue
  '#f72585'  // Rose
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

// Initialize Leaflet Map (Fullscreen, Dark Theme, No UI Controls)
const map = L.map('map', {
  zoomControl: false,
  attributionControl: false,
  fadeAnimation: true
}).setView([41.9028, 12.4964], 14); // Initial view

// High performance minimalist Dark Matter tiles
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19,
  subdomains: 'abcd'
}).addTo(map);

// Data Structures
let myTrail = [];
let myMarker = null;
let myPolyline = null;
let hasInitialGPSFix = false;

// Peer Store: peerId -> { color, trail: [[lat, lng]], marker, polyline }
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
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

// Update Local User Location & Past Trail
function updateMyPosition(lat, lng) {
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
      weight: 3.5,
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
      polyline: null
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

// Sychronize Full Past Trail for a Peer
function syncPeerTrail(id, color, fullTrail) {
  if (id === myId || !Array.isArray(fullTrail) || fullTrail.length === 0) return;

  let peer = peers.get(id);
  if (!peer) {
    peer = {
      color: color || stringToColor(id),
      trail: [],
      marker: null,
      polyline: null
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
      // Announce arrival and broadcast existing trail
      broadcast({
        type: 'join',
        id: myId,
        color: myColor,
        trail: myTrail
      });
    }
  });
});

client.on('message', (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    if (data.id === myId) return;

    if (data.type === 'join') {
      // New member joined: respond with our full trail history so they see past paths
      if (myTrail.length > 0) {
        broadcast({
          type: 'sync',
          id: myId,
          color: myColor,
          trail: myTrail
        });
      }
      if (data.trail && data.trail.length > 0) {
        syncPeerTrail(data.id, data.color, data.trail);
      }
    } else if (data.type === 'sync') {
      syncPeerTrail(data.id, data.color, data.trail);
    } else if (data.type === 'pos' && data.coord) {
      updatePeerPosition(data.id, data.color, data.coord);
    }
  } catch (e) {
    // Ignore malformed packets
  }
});

// HTML5 Geolocation API (High Accuracy Live Watch)
if ('geolocation' in navigator) {
  navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      updateMyPosition(lat, lng);
    },
    (err) => {
      console.warn('Geolocation notice:', err.message);
      // If running on desktop without active GPS movement, start subtle preview movement around default center
      if (myTrail.length === 0) {
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

// Fallback: subtle movement if GPS is unavailable (e.g. desktop testing)
function startDesktopSimulation(baseLat, baseLng) {
  let simLat = baseLat + (Math.random() - 0.5) * 0.005;
  let simLng = baseLng + (Math.random() - 0.5) * 0.005;
  updateMyPosition(simLat, simLng);

  let angle = Math.random() * Math.PI * 2;
  setInterval(() => {
    angle += (Math.random() - 0.5) * 0.4;
    simLat += Math.cos(angle) * 0.00008;
    simLng += Math.sin(angle) * 0.00008;
    updateMyPosition(simLat, simLng);
  }, 3000);
}
