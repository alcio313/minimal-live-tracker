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

function slugifyGroupName(name) {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9àèéìòùáéíóú_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'volantini-x';
}

function formatGroupName(slug) {
  if (!slug) return 'Volantini X';
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Parse URL Invite Parameters (supports #group=...&pwd=...&carto_key=... or query params)
function parseUrlInviteParams() {
  const result = {
    group: '',
    pwd: '',
    cartoKey: '',
    fromInvite: false
  };

  try {
    // 1. URL Query Parameters (?group=...&pwd=...&carto_key=...)
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has('group')) result.group = searchParams.get('group').trim();
    if (searchParams.has('pwd')) result.pwd = searchParams.get('pwd').trim();
    if (searchParams.has('password')) result.pwd = searchParams.get('password').trim();
    if (searchParams.has('carto_key')) result.cartoKey = searchParams.get('carto_key').trim();
    if (searchParams.has('keyapi')) result.cartoKey = searchParams.get('keyapi').trim();

    // 2. URL Hash Fragment (#group=...&pwd=... or #slug?pwd=... or #slug)
    let rawHash = window.location.hash.substring(1).trim();
    if (rawHash) {
      if (rawHash.includes('=') || rawHash.includes('&') || rawHash.includes('?')) {
        let hashQuery = rawHash;
        if (rawHash.includes('?')) {
          const parts = rawHash.split('?');
          if (!result.group && parts[0]) {
            result.group = formatGroupName(parts[0]);
          }
          hashQuery = parts[1];
        }
        const hashParams = new URLSearchParams(hashQuery);
        if (hashParams.has('group') && !result.group) result.group = hashParams.get('group').trim();
        if (hashParams.has('pwd') && !result.pwd) result.pwd = hashParams.get('pwd').trim();
        if (hashParams.has('password') && !result.pwd) result.pwd = hashParams.get('password').trim();
        if (hashParams.has('carto_key') && !result.cartoKey) result.cartoKey = hashParams.get('carto_key').trim();
        if (hashParams.has('keyapi') && !result.cartoKey) result.cartoKey = hashParams.get('keyapi').trim();
      } else {
        // Simple slug in hash (e.g. #monte-bianco)
        if (!result.group) {
          result.group = formatGroupName(rawHash);
        }
      }
    }

    if (result.pwd || (result.group && result.group.toLowerCase() !== 'volantini x')) {
      result.fromInvite = true;
    }
  } catch (e) {
    console.warn('Could not parse invite parameters from URL:', e);
  }

  return result;
}

const inviteParams = parseUrlInviteParams();

// Group & Identity Resolution
let groupDisplayName = inviteParams.group || 'Volantini X';
let roomId = slugifyGroupName(groupDisplayName);

const myId = 'user-' + Math.random().toString(36).substring(2, 9);
const myColor = stringToColor(myId);

// User Custom Display Name
let myName = localStorage.getItem('tracker_username') || `Utente-${myId.substring(5, 9)}`;

// If invite link included a CARTO key, automatically store it for seamless map loading
if (inviteParams.cartoKey) {
  localStorage.setItem('carto_api_key', inviteParams.cartoKey);
}

// ==========================================
// 🔐 End-to-End Encryption (E2EE) WebCrypto
// ==========================================
let e2eeCryptoKey = null;
let currentRoomPassword = inviteParams.pwd || sessionStorage.getItem(`e2ee_pwd_${roomId}`) || '';
if (currentRoomPassword) {
  sessionStorage.setItem(`e2ee_pwd_${roomId}`, currentRoomPassword);
}

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

// 🗺️ Retrieve CARTO API key dynamically from URL (?carto_key=), local config (config.js), or localStorage
function getCartoApiKey() {
  const urlParams = new URLSearchParams(window.location.search);
  const fromUrl = urlParams.get('carto_key');
  if (fromUrl && fromUrl.trim()) return fromUrl.trim();

  if (window.APP_CONFIG && typeof window.APP_CONFIG.CARTO_API_KEY === 'string' && window.APP_CONFIG.CARTO_API_KEY.trim()) {
    return window.APP_CONFIG.CARTO_API_KEY.trim();
  }

  const fromStorage = localStorage.getItem('carto_api_key');
  if (fromStorage && fromStorage.trim()) {
    return fromStorage.trim();
  }

  return '';
}

function buildTileUrl(key) {
  return key
    ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
}

// 🗺️ Leaflet Map Setup with Legally Mandated CARTO and OpenStreetMap (ODbL) Attribution
const map = L.map('map', {
  zoomControl: false,
  attributionControl: true,
  fadeAnimation: true
}).setView([41.9028, 12.4964], 15);

const CARTO_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';

let currentTileLayer = L.tileLayer(buildTileUrl(getCartoApiKey()), {
  maxZoom: 20,
  subdomains: 'abcd',
  attribution: CARTO_ATTRIBUTION
}).addTo(map);

// Trail layer group for rendering solid and dashed gap segments
const myTrailLayer = L.layerGroup().addTo(map);

function refreshTileLayer() {
  if (currentTileLayer) {
    map.removeLayer(currentTileLayer);
  }
  currentTileLayer = L.tileLayer(buildTileUrl(getCartoApiKey()), {
    maxZoom: 20,
    subdomains: 'abcd',
    attribution: CARTO_ATTRIBUTION
  }).addTo(map);
}

// Battery Optimization & Sampling Configuration
const SAMPLING_INTERVAL_MS = 15000; // 15 seconds
const MIN_DISTANCE_METERS = 10;     // 10 meters

let lastBroadcastTime = 0;
let lastRecordedPos = null;
let lastRecordedPosTime = 0;
let lastHiddenTime = 0;
let pendingGap = null;

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
let hasInitialGPSFix = false;

let isTracking = true;
let geoIntervalId = null;
let isFetchingPosition = false;
let wakeLockSentinel = null;
let wakeLockUserEnabled = localStorage.getItem('mlt_wake_lock_enabled') !== 'false';
let simIntervalId = null;
let simLat = 41.9028;
let simLng = 12.4964;
let simAngle = Math.random() * Math.PI * 2;

// Screen Wake Lock API Management (prevents mobile OS suspending JS and GPS)
const wakelockPill = document.getElementById('wakelock-pill');
const wakelockPillText = document.getElementById('wakelock-pill-text');
const wakelockSwitch = document.getElementById('wakelock-switch');
const wakelockStatusHint = document.getElementById('wakelock-status-hint');

function updateWakeLockUI() {
  if (wakelockSwitch) {
    wakelockSwitch.checked = wakeLockUserEnabled;
  }
  if (wakelockStatusHint) {
    wakelockStatusHint.textContent = wakeLockUserEnabled
      ? 'Attivo (consigliato per GPS continuo)'
      : 'Disattivato (lo schermo andrà in standby)';
  }
  if (wakelockPill) {
    if (!isTracking) {
      wakelockPill.style.display = 'none';
      return;
    }
    wakelockPill.style.display = 'inline-flex';
    if (wakeLockUserEnabled) {
      wakelockPill.className = 'wakelock-pill is-active';
      if (wakelockPillText) wakelockPillText.textContent = 'Schermo attivo';
      wakelockPill.title = 'Schermo sempre attivo (clicca per consentire standby)';
    } else {
      wakelockPill.className = 'wakelock-pill is-disabled';
      if (wakelockPillText) wakelockPillText.textContent = 'Schermo: standby';
      wakelockPill.title = 'Schermo standard (clicca per attivare schermo sempre acceso)';
    }
  }
}

function setWakeLockEnabled(enabled, showFeedback = true) {
  wakeLockUserEnabled = enabled;
  localStorage.setItem('mlt_wake_lock_enabled', enabled ? 'true' : 'false');
  if (enabled) {
    if (isTracking) {
      requestWakeLock();
    }
    if (showFeedback) {
      showToast('☀️ Schermo sempre attivo abilitato');
    }
  } else {
    releaseWakeLock();
    if (showFeedback) {
      showToast('🌙 Schermo normale: il display andrà in standby');
    }
  }
  updateWakeLockUI();
}

if (wakelockPill) {
  wakelockPill.addEventListener('click', () => {
    setWakeLockEnabled(!wakeLockUserEnabled, true);
  });
  wakelockPill.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setWakeLockEnabled(!wakeLockUserEnabled, true);
    }
  });
}

if (wakelockSwitch) {
  wakelockSwitch.addEventListener('change', (e) => {
    setWakeLockEnabled(e.target.checked, true);
  });
}

async function requestWakeLock() {
  if (!wakeLockUserEnabled) return;
  if (!('wakeLock' in navigator)) return;
  try {
    if (!wakeLockSentinel && isTracking) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
        updateWakeLockUI();
      });
      updateWakeLockUI();
    }
  } catch (err) {
    console.warn('Wake Lock request error:', err);
  }
}

async function releaseWakeLock() {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch (e) { }
    wakeLockSentinel = null;
    updateWakeLockUI();
  }
}

// Suspension / Inactivity Gap Detection & Resume Handler
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    lastHiddenTime = Date.now();
  } else if (document.visibilityState === 'visible') {
    const now = Date.now();
    if (lastHiddenTime > 0) {
      const elapsedMs = now - lastHiddenTime;
      const elapsedMinutes = Math.round(elapsedMs / 60000);

      // If suspended for >= 60 seconds (1 minute or more)
      if (elapsedMs >= 60000) {
        const msg = elapsedMinutes <= 1
          ? '⚠️ Tracciamento interrotto per circa 1 minuto'
          : `⚠️ Tracciamento interrotto per ${elapsedMinutes} minuti`;
        showToast(msg, 5000);

        if (myTrail.length > 0) {
          pendingGap = {
            durationMinutes: Math.max(1, elapsedMinutes),
            timestamp: now
          };
        }
      }
      lastHiddenTime = 0;
    }

    if (isTracking && wakeLockUserEnabled) {
      requestWakeLock();
    }
    if (isTracking) {
      // Immediate fresh fix upon returning to the app
      fetchCurrentGpsPosition();
    }
  }
});

// Segmented Trail Renderer: Draws solid continuous walking and dashed gap lines
function renderTrailLayer(layerGroup, trail, color) {
  if (!layerGroup) return;
  layerGroup.clearLayers();
  if (!Array.isArray(trail) || trail.length < 2) return;

  let currentSolidSegment = [[trail[0][0], trail[0][1]]];

  for (let i = 1; i < trail.length; i++) {
    const prevPt = [trail[i - 1][0], trail[i - 1][1]];
    const currPt = [trail[i][0], trail[i][1]];
    const isGap = trail[i][2] === 1 || Boolean(trail[i].isGap);
    const gapMin = trail[i][3] || trail[i].gapMinutes || 0;

    if (isGap) {
      // Flush prior continuous solid segment
      if (currentSolidSegment.length > 1) {
        L.polyline(currentSolidSegment, {
          color: color,
          weight: 6,
          opacity: 0.95,
          smoothFactor: 1,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(layerGroup);
      }
      currentSolidSegment = [currPt];

      // Draw dashed segment connecting the gap
      const gapPolyline = L.polyline([prevPt, currPt], {
        color: color,
        weight: 4.5,
        opacity: 0.8,
        dashArray: '7, 9',
        lineCap: 'round'
      }).addTo(layerGroup);

      const label = gapMin > 0 ? `Interruzione: ~${gapMin} min` : 'Interruzione tracciamento';
      gapPolyline.bindTooltip(label, {
        sticky: true,
        direction: 'top'
      });
    } else {
      currentSolidSegment.push(currPt);
    }
  }

  // Flush remaining solid segment
  if (currentSolidSegment.length > 1) {
    L.polyline(currentSolidSegment, {
      color: color,
      weight: 6,
      opacity: 0.95,
      smoothFactor: 1,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(layerGroup);
  }
}

// Allow desktop simulation only if explicitly requested (?sim=1) or during local development
function isSimulationAllowed() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('sim') === '1') return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function showToast(message, duration = 3000) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timeoutId);
  toast._timeoutId = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

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
const groupNameInput = document.getElementById('group-name-input');
const roomPasswordInput = document.getElementById('room-password-input');
const initialUsernameInput = document.getElementById('initial-username-input');
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
  roomNameDisplay.textContent = `${groupDisplayName}`;
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
    if (groupNameInput) groupNameInput.value = groupDisplayName;
    if (initialUsernameInput) initialUsernameInput.value = myName;
    if (roomPasswordInput) {
      roomPasswordInput.value = currentRoomPassword;
    }

    const inviteBanner = document.getElementById('invite-link-banner');
    if (inviteBanner) {
      if (inviteParams.fromInvite && currentRoomPassword) {
        inviteBanner.style.display = 'flex';
      } else {
        inviteBanner.style.display = 'none';
      }
    }

    setTimeout(() => {
      // If group and password arrived via invite link, focus directly on the username input!
      if (inviteParams.fromInvite && currentRoomPassword) {
        if (initialUsernameInput) {
          initialUsernameInput.focus();
          initialUsernameInput.select();
        }
      } else if (groupNameInput && !groupNameInput.value) {
        groupNameInput.focus();
      } else if (roomPasswordInput && !roomPasswordInput.value) {
        roomPasswordInput.focus();
      } else if (initialUsernameInput) {
        initialUsernameInput.focus();
      }
    }, 150);
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
      myMarker.bindTooltip(`${escapeHtml(myName)} (Tu)`, { permanent: true, direction: 'top', offset: [0, -14] });
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

  // If initial fix or forced, accept and broadcast immediately
  if (!hasInitialGPSFix || force) {
    hasInitialGPSFix = true;
    lastBroadcastTime = now;
    lastRecordedPosTime = now;
    lastRecordedPos = [lat, lng];

    const coord = [lat, lng, 0, 0];
    myTrail.push(coord);

    if (!myMarker) {
      myMarker = L.marker([lat, lng], {
        icon: createMarkerIcon(myColor, true),
        zIndexOffset: 1000
      }).addTo(map);
      myMarker.bindTooltip(`${escapeHtml(myName)} (Tu)`, { permanent: true, direction: 'top', offset: [0, -14] });
    } else {
      myMarker.setLatLng([lat, lng]);
    }

    renderTrailLayer(myTrailLayer, myTrail, myColor);
    map.setView([lat, lng], 16, { animate: true });

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
    myMarker.setLatLng([lat, lng]);
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

  // Filter 2: Has at least 12 seconds passed since the last broadcast? (prevents timer jitter issues on 15s intervals)
  const timeElapsed = now - lastBroadcastTime;
  if (timeElapsed < 12000) {
    return;
  }

  // Check for prolonged suspension / inactivity gap (e.g. >= 2 min) if not already flagged
  if (lastRecordedPosTime > 0 && (now - lastRecordedPosTime) >= 120000 && !pendingGap) {
    const gapMin = Math.round((now - lastRecordedPosTime) / 60000);
    showToast(`⚠️ Tracciamento interrotto per ${gapMin} minuti`, 5000);
    pendingGap = {
      durationMinutes: gapMin,
      timestamp: now
    };
  }

  let isGap = false;
  let gapDuration = 0;
  if (pendingGap && myTrail.length > 0) {
    isGap = true;
    gapDuration = pendingGap.durationMinutes;
    pendingGap = null;
  }

  // Both conditions met: >= 10m moved AND >= 15s elapsed
  const coord = [lat, lng, isGap ? 1 : 0, gapDuration];
  lastBroadcastTime = now;
  lastRecordedPosTime = now;
  lastRecordedPos = [lat, lng];
  myTrail.push(coord);

  renderTrailLayer(myTrailLayer, myTrail, myColor);

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
      trailLayer: L.layerGroup().addTo(map),
      isPaused: false,
      lastSeen: Date.now()
    };
    peers.set(id, peer);
  } else {
    peer.lastSeen = Date.now();
    if (name) peer.name = name;
  }

  peer.trail.push(coord);
  const latLng = [coord[0], coord[1]];

  // Update or create peer marker (48px Senior Accessible)
  if (!peer.marker) {
    peer.marker = L.marker(latLng, {
      icon: createMarkerIcon(peer.color, false),
      zIndexOffset: 500
    }).addTo(map);
    peer.marker.bindTooltip(escapeHtml(peer.name), { permanent: true, direction: 'top', offset: [0, -14] });
  } else {
    peer.marker.setLatLng(latLng);
    if (name) {
      peer.marker.setTooltipContent(escapeHtml(name));
    }
  }

  // Update peer trail segments
  if (!peer.trailLayer) {
    peer.trailLayer = L.layerGroup().addTo(map);
  }
  renderTrailLayer(peer.trailLayer, peer.trail, peer.color);
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
      trailLayer: L.layerGroup().addTo(map),
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
  const latLng = [lastCoord[0], lastCoord[1]];

  if (!peer.marker) {
    peer.marker = L.marker(latLng, {
      icon: createMarkerIcon(peer.color, false),
      zIndexOffset: 500
    }).addTo(map);
    peer.marker.bindTooltip(escapeHtml(peer.name), { permanent: true, direction: 'top', offset: [0, -14] });
  } else {
    peer.marker.setLatLng(latLng);
    if (name) {
      peer.marker.setTooltipContent(escapeHtml(name));
    }
  }

  if (!peer.trailLayer) {
    peer.trailLayer = L.layerGroup().addTo(map);
  }
  renderTrailLayer(peer.trailLayer, peer.trail, peer.color);
}

// 📡 Real-Time Serverless Network (MQTT over WebSockets)
// Dedicated HiveMQ Cloud cluster in EU with TLS WebSockets
const MQTT_BROKER = 'wss://02c32905ccdb4e97b9cd3860b9ae6f14.s1.eu.hivemq.cloud:8884/mqtt';
const MQTT_USER = 'tracker_user';
const MQTT_PASS = '=$GuL>X#N9G;Yum';

let TOPIC_PREFIX = `geotrack_minimal_v1/${roomId}`;
let MY_TOPIC = `${TOPIC_PREFIX}/${myId}`;
let ROOM_WILDCARD = `${TOPIC_PREFIX}/+`;

const client = mqtt.connect(MQTT_BROKER, {
  clean: true,
  connectTimeout: 8000,
  reconnectPeriod: 2500,
  clientId: myId,
  username: MQTT_USER,
  password: MQTT_PASS
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
          trailLayer: L.layerGroup().addTo(map),
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
          trailLayer: L.layerGroup().addTo(map),
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
          trailLayer: L.layerGroup().addTo(map),
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
        if (leavingPeer) {
          if (leavingPeer.marker) {
            map.removeLayer(leavingPeer.marker);
          }
          if (leavingPeer.trailLayer) {
            map.removeLayer(leavingPeer.trailLayer);
          }
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

// Fetch single position fix using getCurrentPosition (duty-cycled to let GPS chip idle between readings)
function fetchCurrentGpsPosition() {
  if (!isTracking || !e2eeCryptoKey || isFetchingPosition) return;

  if (!('geolocation' in navigator)) {
    if (isSimulationAllowed()) {
      startDesktopSimulation(41.9028, 12.4964);
    } else {
      showToast('⚠️ Geolocalizzazione non supportata');
    }
    return;
  }

  isFetchingPosition = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      isFetchingPosition = false;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      updateMyPosition(lat, lng);
    },
    (err) => {
      isFetchingPosition = false;
      console.warn('Geolocation notice:', err.message);
      if (myTrail.length === 0 && !simIntervalId) {
        if (isSimulationAllowed()) {
          startDesktopSimulation(41.9028, 12.4964);
        } else {
          showToast('⚠️ Attiva la posizione');
        }
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }
  );
}

// Start Duty-Cycled GPS Tracking (every 15s) and Acquire Screen Wake Lock
function startGeolocationTracking() {
  if (!e2eeCryptoKey) return;

  // 1. Keep screen active to prevent mobile OS suspending JS execution
  requestWakeLock();

  // 2. Clear any existing timer
  if (geoIntervalId !== null) {
    clearInterval(geoIntervalId);
    geoIntervalId = null;
  }

  // 3. Immediate initial fix
  fetchCurrentGpsPosition();

  // 4. Periodic polling every 15s (allows the hardware GPS chip to power-down between fixes)
  geoIntervalId = setInterval(() => {
    fetchCurrentGpsPosition();
  }, SAMPLING_INTERVAL_MS);
}

// Stop GPS / Desktop simulation and Release Screen Wake Lock
function stopGeolocationTracking() {
  // 1. Release Screen Wake Lock
  releaseWakeLock();

  // 2. Stop periodic GPS polling
  if (geoIntervalId !== null) {
    clearInterval(geoIntervalId);
    geoIntervalId = null;
  }
  isFetchingPosition = false;

  // 3. Stop simulation if active
  if (simIntervalId !== null) {
    clearInterval(simIntervalId);
    simIntervalId = null;
  }
}

// Fallback: subtle movement if GPS is unavailable (only with ?sim=1 or on localhost)
function startDesktopSimulation(baseLat, baseLng) {
  if (!isSimulationAllowed()) return;
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
  updateWakeLockUI();
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
    const lastCoord = [myTrail[myTrail.length - 1][0], myTrail[myTrail.length - 1][1]];
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
        if (isSimulationAllowed()) {
          map.flyTo([simLat, simLng], 16, { duration: 0.8 });
        } else {
          showToast('⚠️ Attiva la posizione');
        }
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

// Share Room / Invite Link Generation
function generateInviteUrl(includePassword = true, includeCartoKey = true) {
  const base = window.location.origin + window.location.pathname;
  if (!includePassword && !includeCartoKey) {
    return `${base}#${roomId}`;
  }

  const hashParams = new URLSearchParams();
  if (groupDisplayName) {
    hashParams.set('group', groupDisplayName);
  }
  if (includePassword && currentRoomPassword) {
    hashParams.set('pwd', currentRoomPassword);
  }
  const cartoKey = getCartoApiKey();
  if (includeCartoKey && cartoKey) {
    hashParams.set('carto_key', cartoKey);
  }

  // Storing parameters in the hash fragment prevents them from being sent to HTTP servers
  return `${base}#${hashParams.toString()}`;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
  } else {
    const tempInput = document.createElement('input');
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
  }
}

// Share Room Button inside Modal (Full Invite with password and map key)
if (shareRoomBtn) {
  shareRoomBtn.addEventListener('click', async () => {
    try {
      const inviteUrl = generateInviteUrl(true, true);
      await copyTextToClipboard(inviteUrl);
      showToast('✅ Link invito copiato! (Include gruppo, password e mappa)', 3000);
    } catch (err) {
      console.warn('Clipboard copy error:', err);
    }
  });
}

const shareRoomPlainBtn = document.getElementById('share-room-plain-btn');
if (shareRoomPlainBtn) {
  shareRoomPlainBtn.addEventListener('click', async () => {
    try {
      const plainUrl = generateInviteUrl(false, false);
      await copyTextToClipboard(plainUrl);
      showToast('Link stanza copiato (senza password)', 2200);
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

// 🗺️ CARTO Basemaps Key Modal Handlers
const modalCartoKeyBtn = document.getElementById('modal-carto-key-btn');
const cartoModal = document.getElementById('carto-modal');
const closeCartoBtn = document.getElementById('close-carto-btn');
const cartoApiKeyInput = document.getElementById('carto-api-key-input');
const saveCartoKeyBtn = document.getElementById('save-carto-key-btn');
const clearCartoKeyBtn = document.getElementById('clear-carto-key-btn');

function openCartoModal() {
  if (cartoModal) {
    if (cartoApiKeyInput) {
      cartoApiKeyInput.value = localStorage.getItem('carto_api_key') || '';
    }
    cartoModal.classList.add('is-open');
    cartoModal.setAttribute('aria-hidden', 'false');
  }
}

function closeCartoModal() {
  if (cartoModal) {
    cartoModal.classList.remove('is-open');
    cartoModal.setAttribute('aria-hidden', 'true');
  }
}

if (modalCartoKeyBtn) {
  modalCartoKeyBtn.addEventListener('click', () => {
    closeParticipantsModal();
    openCartoModal();
  });
}

if (closeCartoBtn) {
  closeCartoBtn.addEventListener('click', closeCartoModal);
}

if (cartoModal) {
  cartoModal.addEventListener('click', (e) => {
    if (e.target === cartoModal) {
      closeCartoModal();
    }
  });
}

if (saveCartoKeyBtn) {
  saveCartoKeyBtn.addEventListener('click', () => {
    const key = (cartoApiKeyInput ? cartoApiKeyInput.value : '').trim();
    if (key) {
      localStorage.setItem('carto_api_key', key);
    } else {
      localStorage.removeItem('carto_api_key');
    }
    refreshTileLayer();
    closeCartoModal();
    if (toast) {
      toast.textContent = key ? 'Chiave CARTO salvata!' : 'Chiave CARTO rimossa';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
    }
  });
}

if (clearCartoKeyBtn) {
  clearCartoKeyBtn.addEventListener('click', () => {
    localStorage.removeItem('carto_api_key');
    if (cartoApiKeyInput) cartoApiKeyInput.value = '';
    refreshTileLayer();
    closeCartoModal();
    if (toast) {
      toast.textContent = 'Chiave CARTO rimossa';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
    }
  });
}

// Group Onboarding & Password Unlock Flow
async function unlockWithCredentials(groupName, pwd, userName) {
  groupName = (groupName || '').trim() || 'Volantini X';
  pwd = (pwd || '').trim();
  userName = (userName || '').trim() || myName;

  if (!pwd) {
    if (roomPasswordInput) roomPasswordInput.focus();
    return;
  }

  // Update user name
  myName = userName;
  localStorage.setItem('tracker_username', myName);

  // Update group name and slug
  groupDisplayName = groupName;
  const newRoomId = slugifyGroupName(groupName);

  if (newRoomId !== roomId && client && client.connected) {
    client.unsubscribe(ROOM_WILDCARD);
  }

  roomId = newRoomId;
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', `${window.location.pathname}#${roomId}`);
  } else {
    window.location.hash = roomId;
  }

  TOPIC_PREFIX = `geotrack_minimal_v1/${roomId}`;
  MY_TOPIC = `${TOPIC_PREFIX}/${myId}`;
  ROOM_WILDCARD = `${TOPIC_PREFIX}/+`;

  currentRoomPassword = pwd;
  sessionStorage.setItem(`e2ee_pwd_${roomId}`, pwd);

  // Derive AES-GCM 256 Key
  e2eeCryptoKey = await deriveKeyFromPassword(pwd, `geotrack_salt_v1_${roomId}`);

  if (roomNameDisplay) {
    roomNameDisplay.textContent = `${groupDisplayName}`;
  }

  if (myMarker) {
    myMarker.unbindTooltip();
    myMarker.bindTooltip(`${escapeHtml(myName)} (Tu)`, { permanent: true, direction: 'top', offset: [0, -14] });
  }

  closeE2EEModal();

  if (toast) {
    toast.textContent = `Gruppo "${groupDisplayName}" attivato!`;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      toast.textContent = 'Link gruppo copiato!';
    }, 2200);
  }

  // Resubscribe with new room topic
  if (client && client.connected) {
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
  }

  // Start tracking and join room
  startGeolocationTracking();
  updateParticipantCount();
}

function handleOnboardingSubmit() {
  const gName = groupNameInput ? groupNameInput.value : groupDisplayName;
  const pwd = roomPasswordInput ? roomPasswordInput.value : '';
  const uName = initialUsernameInput ? initialUsernameInput.value : myName;
  unlockWithCredentials(gName, pwd, uName);
}

if (e2eeForm) {
  e2eeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleOnboardingSubmit();
  });
}

if (unlockRoomBtn) {
  unlockRoomBtn.addEventListener('click', (e) => {
    e.preventDefault();
    handleOnboardingSubmit();
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
  updateWakeLockUI();
  if (inviteParams.cartoKey) {
    refreshTileLayer();
  }

  // If opening via an invite link with preloaded password, open the modal so the user enters their name
  if (inviteParams.fromInvite && inviteParams.pwd) {
    openE2EEModal();
    return;
  }

  if (currentRoomPassword) {
    e2eeCryptoKey = await deriveKeyFromPassword(currentRoomPassword, `geotrack_salt_v1_${roomId}`);
    startGeolocationTracking();
    updateParticipantCount();
  } else {
    openE2EEModal();
  }
}

// ==========================================
// 📱 PWA Install & Offline Status Support
// ==========================================
let deferredInstallPrompt = null;
const modalInstallPwaBtn = document.getElementById('modal-install-pwa-btn');
const onlineIndicator = document.querySelector('.online-indicator');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (modalInstallPwaBtn) {
    modalInstallPwaBtn.style.display = 'flex';
  }
});

if (modalInstallPwaBtn) {
  modalInstallPwaBtn.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        modalInstallPwaBtn.style.display = 'none';
      }
      deferredInstallPrompt = null;
    } else {
      if (toast) {
        toast.textContent = 'Aggiungi l\'app dal menu Condividi (iOS) o dalle impostazioni del browser';
        toast.classList.add('show');
        setTimeout(() => {
          toast.classList.remove('show');
          toast.textContent = 'Link gruppo copiato!';
        }, 3500);
      }
    }
  });
}

window.addEventListener('appinstalled', () => {
  if (modalInstallPwaBtn) {
    modalInstallPwaBtn.style.display = 'none';
  }
  if (toast) {
    toast.textContent = '✅ App installata con successo!';
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      toast.textContent = 'Link gruppo copiato!';
    }, 2500);
  }
});

// Network Connectivity Listeners (Online / Offline)
window.addEventListener('offline', () => {
  if (onlineIndicator) {
    onlineIndicator.classList.add('is-offline');
    onlineIndicator.title = 'Offline (GPS locale attivo)';
  }
  if (toast) {
    toast.textContent = '📡 Modalità Offline: GPS attivo (sincronizzazione in pausa)';
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      toast.textContent = 'Link gruppo copiato!';
    }, 3500);
  }
});

window.addEventListener('online', () => {
  if (onlineIndicator) {
    onlineIndicator.classList.remove('is-offline');
    onlineIndicator.title = 'Online';
  }
  if (toast) {
    toast.textContent = '🟢 Connessione ripristinata: sincronizzazione attiva';
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      toast.textContent = 'Link gruppo copiato!';
    }, 3000);
  }
  if (myTrail.length > 0 && e2eeCryptoKey) {
    broadcast({
      type: 'sync',
      id: myId,
      name: myName,
      color: myColor,
      trail: myTrail,
      tracking: isTracking
    });
  }
});

initSession();

