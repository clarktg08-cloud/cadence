/* Cadence · auth: Google sign-in (GIS implicit flow) + Drive file sync.
   Load order: model.js → store.js → auth.js → app.js
   Exports to window: initAuth, handleSignIn, handleSignOut, AUTH_HINT_KEY, _showAuthScreen */

const AUTH_HINT_KEY   = 'cadence_auth_hint';
const DRIVE_FILE_NAME = 'cadence_applications.json';

// ── Fill in after creating an OAuth 2.0 client in Google Cloud Console ──
const CADENCE_CLIENT_ID = '693408908792-ct64d83rpg31gsu7hiqmtjkap21stb5e.apps.googleusercontent.com';

let _token       = null;
let _tokenExpiry = 0;
let _tokenClient = null;
let _fileId      = localStorage.getItem('cadence_file_id');

// ================================================================
// Public API (called from index.html boot + app.js)
// ================================================================
async function initAuth() {
  await new Promise(resolve => {
    const wait = setInterval(() => {
      if (window.google?.accounts?.oauth2) { clearInterval(wait); resolve(); }
    }, 100);
  });

  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CADENCE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: _onToken,
  });

  // Restore token from localStorage if still valid — go straight to app if so
  const tok    = localStorage.getItem('cadence_token');
  const expiry = parseInt(localStorage.getItem('cadence_token_expiry') || '0', 10);
  if (tok && Date.now() < expiry) {
    _token       = tok;
    _tokenExpiry = expiry;
    await _loadFromDrive();
    return true; // skip sign-in flow in caller
  }
  return false;
}

function handleSignIn() {
  document.getElementById('authSpinner').style.display = '';
  document.getElementById('authSignInBtn').style.display = 'none';
  const prompt = localStorage.getItem(AUTH_HINT_KEY) === '1' ? '' : 'consent';
  _tokenClient.requestAccessToken({ prompt });
}

function handleSignOut() {
  _token = null; _tokenExpiry = 0; _fileId = null;
  ['cadence_token','cadence_token_expiry','cadence_file_id',AUTH_HINT_KEY,'cadence_data']
    .forEach(k => localStorage.removeItem(k));
  _showAuthScreen();
}

function _showAuthScreen() {
  document.getElementById('authScreen').style.display = '';
  document.getElementById('appShell').hidden = true;
  document.getElementById('authSpinner').style.display = 'none';
  document.getElementById('authSignInBtn').style.display = '';
}

// ================================================================
// Token callback
// ================================================================
function _onToken(resp) {
  if (resp.error) {
    document.getElementById('authSpinner').style.display = 'none';
    document.getElementById('authSignInBtn').style.display = '';
    return;
  }
  const expiry = Date.now() + (resp.expires_in - 60) * 1000;
  _token       = resp.access_token;
  _tokenExpiry = expiry;
  localStorage.setItem('cadence_token',        _token);
  localStorage.setItem('cadence_token_expiry', String(expiry));
  localStorage.setItem(AUTH_HINT_KEY, '1');
  _loadFromDrive();
}

// ================================================================
// Drive helpers
// ================================================================
async function _driveGet(url, params = {}) {
  const qs  = new URLSearchParams(params).toString();
  const res = await fetch(qs ? `${url}?${qs}` : url, {
    headers: { Authorization: `Bearer ${_token}` },
  });
  if (res.status === 401) { _token = null; throw new Error('401'); }
  return res;
}

async function _drivePatch(url, contentType, body) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${_token}`, 'Content-Type': contentType },
    body,
  });
  if (res.status === 401) { _token = null; throw new Error('401'); }
  return res;
}

async function _findOrCreateFile() {
  if (_fileId) {
    const res = await _driveGet(
      `https://www.googleapis.com/drive/v3/files/${_fileId}`, { fields: 'id' });
    if (res.ok) return _fileId;
    _fileId = null;
    localStorage.removeItem('cadence_file_id');
  }
  const search = await _driveGet('https://www.googleapis.com/drive/v3/files', {
    q: `name='${DRIVE_FILE_NAME}' and trashed=false`,
    fields: 'files(id)', spaces: 'drive',
  });
  const { files } = await search.json();
  if (files?.length) {
    _fileId = files[0].id;
    localStorage.setItem('cadence_file_id', _fileId);
    return _fileId;
  }
  // Create empty file
  const boundary = 'x-cad-bound';
  const meta = JSON.stringify({ name: DRIVE_FILE_NAME, mimeType: 'application/json' });
  const body = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n[]\r\n`,
    `--${boundary}--`,
  ].join('');
  const cr = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST',
      headers: { Authorization: `Bearer ${_token}`,
                 'Content-Type': `multipart/related; boundary=${boundary}` },
      body });
  const { id } = await cr.json();
  _fileId = id;
  localStorage.setItem('cadence_file_id', id);
  return id;
}

// ================================================================
// Load / save
// ================================================================
async function _loadFromDrive() {
  try {
    const fileId = await _findOrCreateFile();
    const res    = await _driveGet(
      `https://www.googleapis.com/drive/v3/files/${fileId}`, { alt: 'media' });
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    Store._setCache(list);
    const migrated = Store.migrateLocalStorage();
    if (migrated) localStorage.removeItem('cadence.applications.v1');
    localStorage.setItem('cadence_data', JSON.stringify(Store.getAll()));
    document.getElementById('appShell').hidden = false;
    document.getElementById('authScreen').style.display = 'none';
    render();
  } catch (e) {
    console.error('Drive load:', e);
    const cached = localStorage.getItem('cadence_data');
    if (cached) {
      Store._setCache(JSON.parse(cached));
      document.getElementById('appShell').hidden = false;
      document.getElementById('authScreen').style.display = 'none';
      render();
      toast('Offline — changes saved locally');
    } else {
      _showAuthScreen();
    }
  }
}

async function _saveToDrive(list) {
  localStorage.setItem('cadence_data', JSON.stringify(list));
  if (!_token || Date.now() >= _tokenExpiry || !_fileId) return;
  try {
    await _drivePatch(
      `https://www.googleapis.com/upload/drive/v3/files/${_fileId}?uploadType=media`,
      'application/json', JSON.stringify(list));
  } catch (e) {
    console.error('Drive save:', e);
  }
}
