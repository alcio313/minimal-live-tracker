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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Automatic Room & Identity Resolution
let roomId = window.location.hash.substring(1).trim();
if (!roomId) {
  roomId = 'stanza-' + Math.random().toString(36).substring(2, 8);
  window.location.hash = roomId;
}

const myId = 'user-' + Math.random().toString(36).substring(2, 9);
const myColor = stringToColor(myId);

// User Custom Display Name
let myName = localStorage.getItem('tracker_username') || `Utente-${myId.substring(5, 9)}`;

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

// Peer Store: peerId -> { name, color, trail: [[lat, lng]], marker, polyline, isPaused, lastSeen }
const peers = new Map();

// UI Elements
const roomNameDisplay = document.getElementById('room-name-display');
const userCountText = document.getElementById('user-count-text');
const roomBadge = document.getElementById('room-badge');
const toast = document.getElementById('toast');

// Modal UI Elements
const participantsModal = document.getElementById('participants-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const usernameInput = document.getElementById('username-input');
const saveNameBtn = document.getElementById('save-name-btn');
const selfColorDot = document.getElementById('self-color-dot');
const modalCountBadge = document.getElementById('modal-count-badge');
const participantsList = document.getElementById('participants-list');
const shareRoomBtn = document.getElementById('share-room-btn');

if (roomNameDisplay) {
  roomNameDisplay.textContent = roomId;
}
if (selfColorDot) {
  selfColorDot.style.backgroundColor = myColor;
}

// Render Participants List in Modal
function renderParticipantsList() {
  const now = Date.now();
  let activePeers = 0;

  if (participantsList) {
    participantsList.innerHTML = '';

    // 1. Add Self
    const selfItem = document.createElement('div');
    selfItem.className = 'participant-item';
    selfItem.innerHTML = `
      <div class="participant-main">
        <div class="participant-avatar" style="background-color: ${myColor}; box-shadow: 0 0 8px ${myColor}"></div>
        <div>
          <span class="participant-name-text">${escapeHtml(myName)}</span>
          <span class="participant-is-you">Tu</span>
        </div>
      </div>
      <div class="participant-status-indicator ${isTracking ? '' : 'is-paused'}">
        <span class="participant-status-dot"></span>
        <span>${isTracking ? 'In tracking' : 'In pausa'}</span>
      </div>
    `;
    selfItem.addEventListener('click', () => {
      recenterMap();
      closeParticipantsModal();
    });
    participantsList.appendChild(selfItem);

    // 2. Add Active Peers
    for (const [id, peer] of peers.entries()) {
      if (now - (peer.lastSeen || 0) < 25000) {
        activePeers++;
        const peerItem = document.createElement('div');
        peerItem.className = 'participant-item';
        const peerName = peer.name || `Utente-${id.substring(5, 9)}`;
        const isPaused = peer.isPaused || false;
        peerItem.innerHTML = `
          <div class="participant-main">
            <div class="participant-avatar" style="background-color: ${peer.color}; box-shadow: 0 0 8px ${peer.color}"></div>
            <span class="participant-name-text">${escapeHtml(peerName)}</span>
          </div>
          <div class="participant-status-indicator ${isPaused ? 'is-paused' : ''}">
            <span class="participant-status-dot"></span>
            <span>${isPaused ? 'In pausa' : 'In tracking'}</span>
          </div>
        `;
        peerItem.addEventListener('click', () => {
          if (peer.marker) {
            map.flyTo(peer.marker.getLatLng(), Math.max(map.getZoom(), 16), { duration: 0.8 });
            closeParticipantsModal();
          }
        });
        participantsList.appendChild(peerItem);
      }
    }
  } else {
    for (const [id, peer] of peers.entries()) {
      if (now - (peer.lastSeen || 0) < 25000) {
        activePeers++;
      }
    }
  }

  const total = 1 + activePeers;
  if (userCountText) {
    userCountText.textContent = total === 1 ? '1 online' : `${total} online`;
  }
  if (modalCountBadge) {
    modalCountBadge.textContent = `${total} online`;
  }
}

function updateParticipantCount() {
  renderParticipantsList();
}

// Modal Control
function openParticipantsModal() {
  if (participantsModal) {
    if (usernameInput) usernameInput.value = myName;
    if (selfColorDot) selfColorDot.style.backgroundColor = myColor;
    renderParticipantsList();
    participantsModal.classList.add('is-open');
    participantsModal.setAttribute('aria-hidden', 'false');
  }
}

function closeParticipantsModal() {
  if (participantsModal) {
    participantsModal.classList.remove('is-open');
    participantsModal.setAttribute('aria-hidden', 'true');
  }
}

// Save Custom Name
function saveCustomName() {
  if (!usernameInput) return;
  const newName = usernameInput.value.trim();
  if (newName && newName !== myName) {
    myName = newName;
    localStorage.setItem('tracker_username', myName);

    // Update self marker tooltip
    if (myMarker) {
      myMarker.unbindTooltip();
      myMarker.bindTooltip(`${escapeHtml(myName)} (Tu)`, { permanent: false, direction: 'top', offset: [0, -10] });
    }

    // Broadcast name update to room
    broadcast({
      type: 'name',
      id: myId,
      name: myName,
      color: myColor
    });

    renderParticipantsList();

    if (toast) {
      toast.textContent = `Nome aggiornato: ${myName}`;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        toast.textContent = 'Link stanza copiato!';
      }, 2000);
    }
  }
}

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
    myMarker.bindTooltip(`${escapeHtml(myName)} (Tu)`, { permanent: false, direction: 'top', offset: [0, -10] });
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
    name: myName,
    color: myColor,
    coord: coord,
    time: Date.now()
  });
}

// Update or Create Peer Position & Past Trail
function updatePeerPosition(id, color, coord, name) {
  if (id === myId) return;

  let peer = peers.get(id);
  if (!peer) {
    peer = {
      name: name || `Utente-${id.substring(5, 9)}`,
      color: color || stringToColor(id),
      trail: [],
      marker: null,
      polyline: null,
      isPaused: false,
      lastSeen: Date.now()
    };
    peers.set(id, peer);
  } else {
    peer.lastSeen = Date.now();
    if (name) peer.name = name;
  }

  peer.trail.push(coord);

  // Update or create peer marker
  if (!peer.marker) {
    peer.marker = L.marker(coord, {
      icon: createMarkerIcon(peer.color, false),
      zIndexOffset: 500
    }).addTo(map);
    peer.marker.bindTooltip(escapeHtml(peer.name), { permanent: false, direction: 'top', offset: [0, -10] });
  } else {
    peer.marker.setLatLng(coord);
    if (name) {
      peer.marker.setTooltipContent(escapeHtml(name));
    }
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
function syncPeerTrail(id, color, fullTrail, name) {
  if (id === myId || !Array.isArray(fullTrail) || fullTrail.length === 0) return;

  let peer = peers.get(id);
  if (!peer) {
    peer = {
      name: name || `Utente-${id.substring(5, 9)}`,
      color: color || stringToColor(id),
      trail: [],
      marker: null,
      polyline: null,
      isPaused: false,
      lastSeen: Date.now()
    };
    peers.set(id, peer);
  } else {
    peer.lastSeen = Date.now();
    if (name) peer.name = name;
  }

  peer.trail = fullTrail;
  const lastCoord = fullTrail[fullTrail.length - 1];

  if (!peer.marker) {
    peer.marker = L.marker(lastCoord, {
      icon: createMarkerIcon(peer.color, false),
      zIndexOffset: 500
    }).addTo(map);
    peer.marker.bindTooltip(escapeHtml(peer.name), { permanent: false, direction: 'top', offset: [0, -10] });
  } else {
    peer.marker.setLatLng(lastCoord);
    if (name) {
      peer.marker.setTooltipContent(escapeHtml(name));
    }
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
        name: myName,
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

    let peer = peers.get(data.id);
    if (peer) {
      peer.lastSeen = Date.now();
      if (data.name) {
        peer.name = data.name;
        if (peer.marker) {
          peer.marker.setTooltipContent(escapeHtml(data.name));
        }
      }
    }

    if (data.type === 'join') {
      if (!peer) {
        peer = {
          name: data.name || `Utente-${data.id.substring(5, 9)}`,
          color: data.color || stringToColor(data.id),
          trail: [],
          marker: null,
          polyline: null,
          isPaused: (data.tracking === false),
          lastSeen: Date.now()
        };
        peers.set(data.id, peer);
      }
      if (myTrail.length > 0) {
        broadcast({
          type: 'sync',
          id: myId,
          name: myName,
          color: myColor,
          trail: myTrail,
          tracking: isTracking
        });
      }
      if (data.trail && data.trail.length > 0) {
        syncPeerTrail(data.id, data.color, data.trail, data.name);
      }
      updateParticipantCount();
    } else if (data.type === 'sync') {
      syncPeerTrail(data.id, data.color, data.trail, data.name);
      updateParticipantCount();
    } else if (data.type === 'pos' && data.coord) {
      updatePeerPosition(data.id, data.color, data.coord, data.name);
      updateParticipantCount();
    } else if (data.type === 'name' && data.name) {
      if (!peer) {
        peer = {
          name: data.name,
          color: data.color || stringToColor(data.id),
          trail: [],
          marker: null,
          polyline: null,
          isPaused: false,
          lastSeen: Date.now()
        };
        peers.set(data.id, peer);
      } else {
        peer.name = data.name;
        if (peer.marker) {
          peer.marker.setTooltipContent(escapeHtml(data.name));
        }
      }
      updateParticipantCount();
    } else if (data.type === 'ping') {
      if (!peer) {
        peer = {
          name: data.name || `Utente-${data.id.substring(5, 9)}`,
          color: data.color || stringToColor(data.id),
          trail: [],
          marker: null,
          polyline: null,
          isPaused: (data.tracking === false),
          lastSeen: Date.now()
        };
        peers.set(data.id, peer);
      }
      peer.lastSeen = Date.now();
      if (data.tracking !== undefined) {
        peer.isPaused = (data.tracking === false);
      }
      updateParticipantCount();
    } else if (data.type === 'leave') {
      if (peers.has(data.id)) {
        const leavingPeer = peers.get(data.id);
        if (leavingPeer && leavingPeer.marker) {
          map.removeLayer(leavingPeer.marker);
        }
        peers.delete(data.id);
        updateParticipantCount();
      }
    } else if (data.type === 'status') {
      if (peer) {
        peer.isPaused = (data.tracking === false);
        if (peer.marker) {
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
      updateParticipantCount();
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
    btnText.textContent = 'START Tracking';
    btnIcon.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <polygon points="6,4 20,12 6,20" />
      </svg>
    `;
    if (myMarker && myMarker.getElement()) {
      myMarker.getElement().classList.add('is-paused');
    }
  }
  renderParticipantsList();
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
      name: myName,
      tracking: isTracking
    });
  });
}

// Recenter Map on User Location
const recenterBtn = document.getElementById('recenter-btn');

function recenterMap() {
  if (myMarker) {
    const coord = myMarker.getLatLng();
    map.flyTo(coord, Math.max(map.getZoom(), 16), {
      duration: 0.8,
      easeLinearity: 0.25
    });
  } else if (myTrail.length > 0) {
    const lastCoord = myTrail[myTrail.length - 1];
    map.flyTo(lastCoord, Math.max(map.getZoom(), 16), {
      duration: 0.8,
      easeLinearity: 0.25
    });
  } else if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coord = [pos.coords.latitude, pos.coords.longitude];
        updateMyPosition(coord[0], coord[1]);
        map.flyTo(coord, 16, { duration: 0.8 });
      },
      (err) => {
        console.warn('Geolocation notice during recenter:', err);
        map.flyTo([simLat, simLng], 16, { duration: 0.8 });
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }
}

if (recenterBtn) {
  recenterBtn.addEventListener('click', () => {
    recenterMap();
  });
}

// Open Participants Modal on Badge / Count Click
if (roomBadge) {
  roomBadge.addEventListener('click', () => {
    openParticipantsModal();
  });
}

// Close Modal Events
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', closeParticipantsModal);
}

if (participantsModal) {
  participantsModal.addEventListener('click', (e) => {
    if (e.target === participantsModal) {
      closeParticipantsModal();
    }
  });
}

// Save Custom Name Actions
if (saveNameBtn) {
  saveNameBtn.addEventListener('click', saveCustomName);
}

if (usernameInput) {
  usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveCustomName();
    }
  });
}

// Share Room Button inside Modal
if (shareRoomBtn) {
  shareRoomBtn.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(window.location.href);
      } else {
        const tempInput = document.createElement('input');
        tempInput.value = window.location.href;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      }
      if (toast) {
        toast.textContent = 'Link stanza copiato!';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2200);
      }
    } catch (err) {
      console.warn('Clipboard copy error:', err);
    }
  });
}

// Periodic Heartbeat Ping & Presence Cleanup
setInterval(() => {
  if (client && client.connected) {
    broadcast({
      type: 'ping',
      id: myId,
      name: myName,
      color: myColor,
      tracking: isTracking
    });
  }
  updateParticipantCount();
}, 8000);

// Notify other peers upon leaving
window.addEventListener('beforeunload', () => {
  broadcast({
    type: 'leave',
    id: myId
  });
});

// Privacy Policy Modal Handling
const privacyBtn = document.getElementById('privacy-btn');
const modalPrivacyLinkBtn = document.getElementById('modal-privacy-link-btn');
const privacyModal = document.getElementById('privacy-modal');
const closePrivacyBtn = document.getElementById('close-privacy-btn');
const acceptPrivacyBtn = document.getElementById('accept-privacy-btn');

function openPrivacyModal() {
  if (privacyModal) {
    privacyModal.classList.add('is-open');
    privacyModal.setAttribute('aria-hidden', 'false');
  }
}

function closePrivacyModal() {
  if (privacyModal) {
    privacyModal.classList.remove('is-open');
    privacyModal.setAttribute('aria-hidden', 'true');
  }
}

if (privacyBtn) {
  privacyBtn.addEventListener('click', openPrivacyModal);
}

if (modalPrivacyLinkBtn) {
  modalPrivacyLinkBtn.addEventListener('click', () => {
    closeParticipantsModal();
    openPrivacyModal();
  });
}

if (closePrivacyBtn) {
  closePrivacyBtn.addEventListener('click', closePrivacyModal);
}

if (acceptPrivacyBtn) {
  acceptPrivacyBtn.addEventListener('click', closePrivacyModal);
}

if (privacyModal) {
  privacyModal.addEventListener('click', (e) => {
    if (e.target === privacyModal) {
      closePrivacyModal();
    }
  });
}

// Initial Tracking & Presence Boot
startGeolocationTracking();
updateParticipantCount();





