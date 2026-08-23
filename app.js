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

// ==========================================
// 🔐 End-to-End Encryption (E2EE) WebCrypto
// ==========================================
let e2eeCryptoKey = null;
let currentRoomPassword = sessionStorage.getItem(`e2ee_pwd_${roomId}`) || '';

async function deriveKeyFromPassword(password, roomSalt) {
  const enc = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const salt = enc.encode(roomSalt || `geotrack_salt_v1_${roomId}`);

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptPayload(dataObj) {
  if (!e2eeCryptoKey) return null;
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(dataObj));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    e2eeCryptoKey,
    plaintext
  );

  // Convert Uint8Array to Base64
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const ctArray = new Uint8Array(ciphertextBuffer);
  let ctString = '';
  for (let i = 0; i < ctArray.length; i++) {
    ctString += String.fromCharCode(ctArray[i]);
  }
  const ctBase64 = btoa(ctString);

  return {
    e2ee: true,
    iv: ivBase64,
    ct: ctBase64,
    v: 1
  };
}

async function decryptPayload(encryptedPacket) {
  if (!encryptedPacket || !encryptedPacket.e2ee || !encryptedPacket.iv || !encryptedPacket.ct) {
    return null;
  }
  if (!e2eeCryptoKey) return null;

  try {
    const ivStr = atob(encryptedPacket.iv);
    const iv = new Uint8Array(ivStr.length);
    for (let i = 0; i < ivStr.length; i++) {
      iv[i] = ivStr.charCodeAt(i);
    }

    const ctStr = atob(encryptedPacket.ct);
    const ct = new Uint8Array(ctStr.length);
    for (let i = 0; i < ctStr.length; i++) {
      ct[i] = ctStr.charCodeAt(i);
    }

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      e2eeCryptoKey,
      ct
    );

    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decryptedBuffer));
  } catch (err) {
    // Decryption failed: wrong password or tampered packet
    return null;
  }
}

// 🗺️ Leaflet Map Setup
const map = L.map('map', {
  zoomControl: false,
  attributionControl: false,
  fadeAnimation: true
}).setView([41.9028, 12.4964], 15);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  maxZoom: 20,
  subdomains: 'abcd'
}).addTo(map);

// Battery Optimization & Sampling Configuration
const SAMPLING_INTERVAL_MS = 15000; // 15 seconds
const MIN_DISTANCE_METERS = 10;     // 10 meters

let lastBroadcastTime = 0;
let lastRecordedPos = null;

// Haversine Distance Formula (in meters)
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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

// E2EE Modal Elements
const e2eeModal = document.getElementById('e2ee-modal');
const e2eeForm = document.getElementById('e2ee-form');
const roomPasswordInput = document.getElementById('room-password-input');
const togglePwdVisibilityBtn = document.getElementById('toggle-pwd-visibility-btn');
const eyeIcon = document.getElementById('eye-icon');
const unlockRoomBtn = document.getElementById('unlock-room-btn');
const modalChangePwdBtn = document.getElementById('modal-change-pwd-btn');

// Participants Modal Elements
const participantsModal = document.getElementById('participants-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const usernameInput = document.getElementById('username-input');
const saveNameBtn = document.getElementById('save-name-btn');
const selfColorDot = document.getElementById('self-color-dot');
const modalCountBadge = document.getElementById('modal-count-badge');
const participantsList = document.getElementById('participants-list');
const shareRoomBtn = document.getElementById('share-room-btn');

// Privacy Modal Elements
const privacyBtn = document.getElementById('privacy-btn');
const modalPrivacyLinkBtn = document.getElementById('modal-privacy-link-btn');
const privacyModal = document.getElementById('privacy-modal');
const closePrivacyBtn = document.getElementById('close-privacy-btn');
const acceptPrivacyBtn = document.getElementById('accept-privacy-btn');

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

// Modal Control Functions
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

function openE2EEModal() {
  if (e2eeModal) {
    e2eeModal.classList.add('is-open');
    e2eeModal.setAttribute('aria-hidden', 'false');
    if (roomPasswordInput) {
      roomPasswordInput.value = currentRoomPassword;
      setTimeout(() => roomPasswordInput.focus(), 150);
    }
  }
}

function closeE2EEModal() {
  if (e2eeModal) {
    e2eeModal.classList.remove('is-open');
    e2eeModal.setAttribute('aria-hidden', 'true');
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

// Helper: Create custom animated radar marker (48px Senior Accessible)
function createMarkerIcon(color, isSelf = false) {
  return L.divIcon({
    className: '',
    html: `
      <div class="user-marker ${isSelf ? 'is-self' : ''}" style="--marker-color: ${color}">
        <div class="user-marker-pulse"></div>
        <div class="user-marker-core"></div>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24]
  });
}

// Update Local User Location & Past Trail (Filtered: 15s sampling, 10m distance threshold)
function updateMyPosition(lat, lng, force = false) {
  if (!isTracking || !e2eeCryptoKey) return;

  const now = Date.now();
  const coord = [lat, lng];

  // If initial fix or forced, accept and broadcast immediately
  if (!hasInitialGPSFix || force) {
    hasInitialGPSFix = true;
    lastBroadcastTime = now;
    lastRecordedPos = coord;
    myTrail.push(coord);

    if (!myMarker) {
      myMarker = L.marker(coord, {
        icon: createMarkerIcon(myColor, true),
        zIndexOffset: 1000
      }).addTo(map);
      myMarker.bindTooltip(`${escapeHtml(myName)} (Tu)`, { permanent: true, direction: 'top', offset: [0, -14] });
    } else {
      myMarker.setLatLng(coord);
    }

    if (!myPolyline) {
      myPolyline = L.polyline(myTrail, {
        color: myColor,
        weight: 6.5,
        opacity: 0.95,
        smoothFactor: 1,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
    } else {
      myPolyline.setLatLngs(myTrail);
    }

    map.setView(coord, 16, { animate: true });

    broadcast({
      type: 'pos',
      id: myId,
      name: myName,
      color: myColor,
      coord: coord,
      time: now
    });
    return;
  }

  // Smoothly update visual marker position on local device
  if (myMarker) {
    myMarker.setLatLng(coord);
  }

  // Calculate distance moved from last recorded GPS point (Haversine in meters)
  const distanceMoved = lastRecordedPos
    ? getDistanceInMeters(lastRecordedPos[0], lastRecordedPos[1], lat, lng)
    : 0;

  // Filter 1: Has the user moved at least 10 meters?
  if (distanceMoved < MIN_DISTANCE_METERS) {
    // Under 10 meters -> skip saving trail and skip network broadcast to save battery
    return;
  }

  // Filter 2: Has at least 15 seconds passed since the last broadcast?
  const timeElapsed = now - lastBroadcastTime;
  if (timeElapsed < SAMPLING_INTERVAL_MS) {
    // Less than 15s -> hold update until 15s window completes
    return;
  }

  // Both conditions met: >= 10m moved AND >= 15s elapsed
  lastBroadcastTime = now;
  lastRecordedPos = coord;
  myTrail.push(coord);

  if (!myPolyline) {
    myPolyline = L.polyline(myTrail, {
      color: myColor,
      weight: 6.5,
      opacity: 0.95,
      smoothFactor: 1,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);
  } else {
    myPolyline.setLatLngs(myTrail);
  }

  broadcast({
    type: 'pos',
    id: myId,
    name: myName,
    color: myColor,
    coord: coord,
    time: now
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

  // Update or create peer marker (48px Senior Accessible)
  if (!peer.marker) {
    peer.marker = L.marker(coord, {
      icon: createMarkerIcon(peer.color, false),
      zIndexOffset: 500
    }).addTo(map);
    peer.marker.bindTooltip(escapeHtml(peer.name), { permanent: true, direction: 'top', offset: [0, -14] });
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
      weight: 6.5,
      opacity: 0.95,
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
    peer.marker.bindTooltip(escapeHtml(peer.name), { permanent: true, direction: 'top', offset: [0, -14] });
  } else {
    peer.marker.setLatLng(lastCoord);
    if (name) {
      peer.marker.setTooltipContent(escapeHtml(name));
    }
  }

  if (!peer.polyline) {
    peer.polyline = L.polyline(peer.trail, {
      color: peer.color,
      weight: 6.5,
      opacity: 0.95,
      smoothFactor: 1,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);
  } else {
    peer.polyline.setLatLngs(peer.trail);
  }
}

// 📡 Real-Time Serverless Network (MQTT over WebSockets)
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

async function broadcast(data) {
  if (!e2eeCryptoKey || !client.connected) return;
  try {
    const encryptedPacket = await encryptPayload(data);
    if (encryptedPacket) {
      client.publish(MY_TOPIC, JSON.stringify(encryptedPacket), { qos: 0 });
    }
  } catch (err) {
    console.warn('Broadcast encryption error:', err);
  }
}

client.on('connect', () => {
  client.subscribe(ROOM_WILDCARD, (err) => {
    if (!err && e2eeCryptoKey) {
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

client.on('message', async (topic, message) => {
  try {
    const rawData = JSON.parse(message.toString());
    const data = await decryptPayload(rawData);
    if (!data || data.id === myId) return;

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
    // Ignore packet
  }
});

// Start High Accuracy GPS Tracking (Optimized with 10s cached fix & 15s sampling)
function startGeolocationTracking() {
  if (!e2eeCryptoKey) return;
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
        maximumAge: 10000, // 10s GNSS sleep optimization
        timeout: 20000
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
  if (simIntervalId || !e2eeCryptoKey) return;

  if (myTrail.length === 0) {
    simLat = baseLat + (Math.random() - 0.5) * 0.005;
    simLng = baseLng + (Math.random() - 0.5) * 0.005;
    updateMyPosition(simLat, simLng, true);
  }

  // Aligned to 15-second battery sampling window (~15m displacement)
  simIntervalId = setInterval(() => {
    if (!isTracking || !e2eeCryptoKey) return;
    simAngle += (Math.random() - 0.5) * 0.4;
    simLat += Math.cos(simAngle) * 0.00015;
    simLng += Math.sin(simAngle) * 0.00015;
    updateMyPosition(simLat, simLng);
  }, 15000);
}

// ==========================================
// 🔊 Sound & Haptic Vibration Feedback
// ==========================================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Play synthetic acoustic chime using Web Audio API
function playFeedbackSound(isStart) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';

    if (isStart) {
      // Start Sound: Ascending pleasant chime (520Hz -> 784Hz)
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(784, now + 0.12);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } else {
      // Stop Sound: Descending clear chime (740Hz -> 440Hz)
      osc.frequency.setValueAtTime(740, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (e) {
    // Ignore audio autoplay restrictions
  }
}

// Trigger haptic vibration on mobile devices
function triggerHapticFeedback(isStart) {
  try {
    if ('vibrate' in navigator) {
      if (isStart) {
        // Start: Double crisp buzz [60ms on, 40ms off, 80ms on]
        navigator.vibrate([60, 40, 80]);
      } else {
        // Stop: Solid single pulse [120ms on]
        navigator.vibrate([120]);
      }
    }
  } catch (e) {
    // Vibration not supported
  }
}

// Stop / Resume Button Handling
const toggleBtn = document.getElementById('toggle-tracking-btn');
const btnIcon = document.getElementById('btn-icon');
const btnText = document.getElementById('btn-text');

function updateTrackingButtonUI() {
  if (isTracking) {
    toggleBtn.className = 'tracking-btn tracking-active';
    btnText.textContent = 'FERMA CONDIVISIONE';
    btnIcon.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
        <rect x="4" y="4" width="16" height="16" rx="3" />
      </svg>
    `;
    if (myMarker && myMarker.getElement()) {
      myMarker.getElement().classList.remove('is-paused');
    }
  } else {
    toggleBtn.className = 'tracking-btn tracking-paused';
    btnText.textContent = 'AVVIA CONDIVISIONE';
    btnIcon.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
        <polygon points="6,4 20,12 6,20" />
      </svg>
    `;
    if (myMarker && myMarker.getElement()) {
      myMarker.getElement().classList.add('is-paused');
    }
  }
  renderParticipantsList();
}

// Zoom In / Out Controls (Senior Accessibility)
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');

if (zoomInBtn) {
  zoomInBtn.addEventListener('click', () => {
    map.zoomIn();
  });
}

if (zoomOutBtn) {
  zoomOutBtn.addEventListener('click', () => {
    map.zoomOut();
  });
}

if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    isTracking = !isTracking;

    // Trigger Sound & Vibration Feedback
    playFeedbackSound(isTracking);
    triggerHapticFeedback(isTracking);

    if (isTracking) {
      startGeolocationTracking();
    } else {
      stopGeolocationTracking();
    }

    updateTrackingButtonUI();

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

// Privacy Modal Handlers
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

// Change Password Handler
if (modalChangePwdBtn) {
  modalChangePwdBtn.addEventListener('click', () => {
    closeParticipantsModal();
    openE2EEModal();
  });
}

// Toggle Password Visibility
if (togglePwdVisibilityBtn && roomPasswordInput && eyeIcon) {
  togglePwdVisibilityBtn.addEventListener('click', () => {
    const isPass = roomPasswordInput.type === 'password';
    roomPasswordInput.type = isPass ? 'text' : 'password';
    eyeIcon.innerHTML = isPass
      ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
  });
}

// Password Unlock Flow
async function unlockWithPassword(pwd) {
  pwd = (pwd || '').trim();
  if (!pwd) {
    if (roomPasswordInput) roomPasswordInput.focus();
    return;
  }

  currentRoomPassword = pwd;
  sessionStorage.setItem(`e2ee_pwd_${roomId}`, pwd);

  // Derive AES-GCM 256 Key
  e2eeCryptoKey = await deriveKeyFromPassword(pwd);

  closeE2EEModal();

  if (toast) {
    toast.textContent = '🔐 Crittografia E2EE attivata!';
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      toast.textContent = 'Link stanza copiato!';
    }, 2200);
  }

  // Start tracking and join room
  startGeolocationTracking();
  updateParticipantCount();

  if (client.connected) {
    broadcast({
      type: 'join',
      id: myId,
      name: myName,
      color: myColor,
      trail: myTrail,
      tracking: isTracking
    });
  }
}

if (e2eeForm) {
  e2eeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (roomPasswordInput) {
      unlockWithPassword(roomPasswordInput.value);
    }
  });
}

if (unlockRoomBtn) {
  unlockRoomBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (roomPasswordInput) {
      unlockWithPassword(roomPasswordInput.value);
    }
  });
}

// Periodic Heartbeat Ping & Presence Cleanup (15s battery eco interval)
setInterval(() => {
  if (client && client.connected && e2eeCryptoKey) {
    broadcast({
      type: 'ping',
      id: myId,
      name: myName,
      color: myColor,
      tracking: isTracking
    });
  }
  updateParticipantCount();
}, 15000);

// Notify other peers upon leaving
window.addEventListener('beforeunload', () => {
  if (e2eeCryptoKey) {
    broadcast({
      type: 'leave',
      id: myId
    });
  }
});

// Initial Session Startup
async function initSession() {
  if (currentRoomPassword) {
    e2eeCryptoKey = await deriveKeyFromPassword(currentRoomPassword);
    startGeolocationTracking();
    updateParticipantCount();
  } else {
    openE2EEModal();
  }
}

initSession();






