/* ============================================================================
   Shared login/signup gate + Firestore helpers, used by index.html,
   attendance.html and overtime.html. See firebase-config.js for setup and
   firestore.rules for where the real access control is enforced.
   ========================================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot,
  collection, getDocs, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG, USERNAME_DOMAIN } from "./firebase-config.js";

const NOT_CONFIGURED = Object.values(FIREBASE_CONFIG).some(v => String(v).includes('PASTE_ME'));

let app, auth, db;
if (!NOT_CONFIGURED) {
  app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getFirestore(app);
}
export { auth, db };

const emailFor = username => `${username.trim().toLowerCase().replace(/\s+/g, '')}@${USERNAME_DOMAIN}`;

function friendlyAuthError(e) {
  const code = e && e.code || '';
  if (code.includes('invalid-credential') || code.includes('user-not-found') || code.includes('wrong-password'))
    return 'Wrong username or password';
  if (code.includes('email-already-in-use')) return 'That username is already taken';
  if (code.includes('weak-password')) return 'Password needs at least 6 characters';
  if (code.includes('invalid-email')) return 'Usernames can only use letters, numbers, dots, dashes and underscores';
  return e.message || 'Something went wrong';
}

export async function signUp(username, password) {
  username = (username || '').trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username))
    throw new Error('Username needs to be 3-32 characters: letters, numbers, dots, dashes or underscores');
  if ((password || '').length < 6) throw new Error('Password needs at least 6 characters');
  try {
    const cred = await createUserWithEmailAndPassword(auth, emailFor(username), password);
    await setDoc(doc(db, 'users', cred.user.uid), {
      username, role: 'user', attendanceAccess: false, createdAt: serverTimestamp(),
    });
    return cred.user;
  } catch (e) { throw new Error(friendlyAuthError(e)); }
}

export async function logIn(username, password) {
  username = (username || '').trim();
  if (!username) throw new Error('Enter your username');
  try {
    const cred = await signInWithEmailAndPassword(auth, emailFor(username), password);
    return cred.user;
  } catch (e) { throw new Error(friendlyAuthError(e)); }
}

export function logOut() { return signOut(auth); }

export async function getMyProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

/** Superadmin-only: every account on file. */
export async function listAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/** Superadmin-only: grant or revoke attendance-sheet access for one user. */
export function setAttendanceAccess(uid, allowed) {
  return updateDoc(doc(db, 'users', uid), { attendanceAccess: !!allowed });
}

/* ------------------------------------------------------------------------
   Login/signup gate: a full-screen overlay that blocks the page until
   someone is signed in, then gets out of the way. Injects its own CSS so
   it looks right regardless of which page's stylesheet is loaded. */
const GATE_CSS = `
#authGate{position:fixed;inset:0;z-index:9999;background:#eaf2f2;display:flex;
  align-items:center;justify-content:center;padding:20px;font-family:'Roboto','Segoe UI',system-ui,sans-serif}
#authGate .card{background:#fff;border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,.18);
  padding:32px 28px;width:min(360px,100%)}
#authGate h1{margin:0 0 4px;font-size:20px;font-weight:500;color:#00696e;text-align:center}
#authGate p.sub{margin:0 0 22px;font-size:13px;color:#3f4949;text-align:center}
#authGate .tf{position:relative;margin-bottom:16px}
#authGate .tf label{position:absolute;top:-7px;left:12px;padding:0 5px;background:#fff;
  font-size:11px;font-weight:500;color:#3f4949;letter-spacing:.3px}
#authGate .tf input{width:100%;box-sizing:border-box;font:inherit;font-size:15px;color:#191c1c;
  background:transparent;border:1px solid #6f7979;border-radius:4px;padding:13px 14px}
#authGate .tf input:focus{outline:none;border-color:#00696e;box-shadow:inset 0 0 0 1px #00696e}
#authGate .err{color:#ba1a1a;font-size:13px;margin:0 0 14px;min-height:16px}
#authGate button.go{width:100%;height:44px;border:none;border-radius:22px;background:#00696e;
  color:#fff;font:500 15px/1 inherit;cursor:pointer;margin-bottom:14px}
#authGate button.go:disabled{opacity:.5;cursor:default}
#authGate button.go:hover:not(:disabled){background:#005257}
#authGate .switch{text-align:center;font-size:13px;color:#3f4949}
#authGate .switch button{background:none;border:none;color:#00696e;font:inherit;font-weight:500;
  cursor:pointer;padding:0;text-decoration:underline}
#authGate .setup{margin-top:16px;padding:12px 14px;background:#fff3cd;border-radius:8px;
  font-size:12.5px;color:#5c4400;line-height:1.5}
#acctChip{position:fixed;top:10px;inset-inline-end:12px;z-index:60;display:flex;align-items:center;
  gap:8px;background:rgba(255,255,255,.95);border-radius:20px;padding:6px 8px 6px 14px;
  box-shadow:0 1px 4px rgba(0,0,0,.2);font:500 12.5px/1 'Roboto','Segoe UI',system-ui,sans-serif;color:#191c1c}
#acctChip button{border:none;background:#eaf2f2;color:#00696e;border-radius:14px;padding:6px 12px;
  font:500 12px/1 inherit;cursor:pointer}
#acctChip button:hover{background:#d8e8e8}
#acctChip a{color:#00696e;font-weight:600;text-decoration:none}
`;

function injectCss() {
  if (document.getElementById('authGateCss')) return;
  const s = document.createElement('style');
  s.id = 'authGateCss';
  s.textContent = GATE_CSS;
  document.head.appendChild(s);
}

/** Blocks the page behind a login/signup overlay until someone is signed
    in, then resolves with {user, profile}. Also adds a small "Signed in as
    X / Log out" chip that stays for the rest of the session. */
export function requireAuth() {
  injectCss();
  return new Promise((resolve) => {
    if (NOT_CONFIGURED) {
      const div = document.createElement('div');
      div.id = 'authGate';
      div.innerHTML = `<div class="card"><h1>Almost there</h1>
        <p class="sub">This site needs a Firebase project connected before anyone can sign in.</p>
        <div class="setup">Open <code>firebase-config.js</code> in the repo and follow the setup
        steps at the top of that file, then reload this page.</div></div>`;
      document.body.appendChild(div);
      return; // never resolves -- nothing works until it's configured
    }

    const div = document.createElement('div');
    div.id = 'authGate';
    div.innerHTML = gateHTML('login');
    document.body.appendChild(div);
    wireGate(div);

    onAuthStateChanged(auth, async (user) => {
      if (!user) { if (!document.getElementById('authGate')) location.reload(); return; }
      let profile = await getMyProfile(user.uid);
      if (!profile) { // shouldn't normally happen, but don't strand a signed-in user with no doc
        await setDoc(doc(db, 'users', user.uid), {
          username: user.email.split('@')[0], role: 'user', attendanceAccess: false, createdAt: serverTimestamp(),
        });
        profile = await getMyProfile(user.uid);
      }
      document.getElementById('authGate')?.remove();
      addAccountChip(profile);
      resolve({ user, profile });
    });
  });
}

function gateHTML(mode) {
  const isLogin = mode === 'login';
  return `<div class="card">
    <h1>${isLogin ? 'Sign in' : 'Create an account'}</h1>
    <p class="sub">Maaungoodhoo Council · Sheets</p>
    <form id="authForm">
      <div class="tf"><label for="authUser">Username</label><input id="authUser" autocomplete="username" required></div>
      <div class="tf"><label for="authPass">Password</label><input id="authPass" type="password"
        autocomplete="${isLogin ? 'current-password' : 'new-password'}" required></div>
      <p class="err" id="authErr"></p>
      <button class="go" type="submit" id="authGo">${isLogin ? 'Sign in' : 'Create account'}</button>
    </form>
    <p class="switch">${isLogin ? "New here?" : 'Already have an account?'}
      <button type="button" id="authSwitch">${isLogin ? 'Create an account' : 'Sign in'}</button></p>
  </div>`;
}

function wireGate(div) {
  let mode = div.querySelector('#authGo').textContent.includes('Sign in') ? 'login' : 'signup';
  const rerender = () => { div.innerHTML = gateHTML(mode); wireGate(div); };
  div.querySelector('#authSwitch').onclick = () => { mode = mode === 'login' ? 'signup' : 'login'; rerender(); };
  div.querySelector('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    const user = div.querySelector('#authUser').value;
    const pass = div.querySelector('#authPass').value;
    const err = div.querySelector('#authErr');
    const go = div.querySelector('#authGo');
    err.textContent = '';
    go.disabled = true;
    go.textContent = mode === 'login' ? 'Signing in…' : 'Creating…';
    try {
      if (mode === 'login') await logIn(user, pass); else await signUp(user, pass);
      // onAuthStateChanged above takes it from here
    } catch (e2) {
      err.textContent = e2.message;
      go.disabled = false;
      go.textContent = mode === 'login' ? 'Sign in' : 'Create account';
    }
  };
}

function addAccountChip(profile) {
  if (document.getElementById('acctChip')) return;
  const chip = document.createElement('div');
  chip.id = 'acctChip';
  chip.innerHTML = `<span>${escapeHtml(profile.username)}${profile.role === 'superadmin' ? ' · admin' : ''}</span>
    ${profile.role === 'superadmin' ? '<a href="index.html#admin">Manage users</a>' : ''}
    <button type="button" id="acctLogout">Log out</button>`;
  document.body.appendChild(chip);
  chip.querySelector('#acctLogout').onclick = () => logOut();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export { onSnapshot, doc, getDoc, setDoc, updateDoc, collection, getDocs, serverTimestamp };
