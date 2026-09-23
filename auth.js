/* ============================================================================
   Shared login/signup gate + Supabase helpers, used by index.html,
   attendance.html and overtime.html. See supabase-config.js for setup and
   supabase-schema.sql for where the real access control is enforced.
   ========================================================================= */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY, USERNAME_DOMAIN } from './supabase-config.js';

const NOT_CONFIGURED = [SUPABASE_URL, SUPABASE_ANON_KEY].some(v => String(v).includes('PASTE_ME'));

export const supabase = NOT_CONFIGURED ? null : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const emailFor = username => `${username.trim().toLowerCase().replace(/\s+/g, '')}@${USERNAME_DOMAIN}`;

function friendlyAuthError(e) {
  const msg = (e && e.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Wrong username or password';
  if (msg.includes('already registered') || msg.includes('already exists')) return 'That username is already taken';
  if (msg.includes('password') && msg.includes('character')) return 'Password needs at least 6 characters';
  if (msg.includes('duplicate key') && msg.includes('username')) return 'That username is already taken';
  return (e && e.message) || 'Something went wrong';
}

export async function signUp(username, password) {
  username = (username || '').trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username))
    throw new Error('Username needs to be 3-32 characters: letters, numbers, dots, dashes or underscores');
  if ((password || '').length < 6) throw new Error('Password needs at least 6 characters');
  const { data, error } = await supabase.auth.signUp({ email: emailFor(username), password });
  if (error) throw new Error(friendlyAuthError(error));
  if (!data.session)
    throw new Error('Signup needs "Confirm email" turned off in the Supabase project (see supabase-config.js)');
  const { error: profileErr } = await supabase.from('profiles')
    .insert({ id: data.user.id, username, role: 'user', attendance_access: false });
  if (profileErr) throw new Error(friendlyAuthError(profileErr));
  return data.user;
}

export async function logIn(username, password) {
  username = (username || '').trim();
  if (!username) throw new Error('Enter your username');
  const { data, error } = await supabase.auth.signInWithPassword({ email: emailFor(username), password });
  if (error) throw new Error(friendlyAuthError(error));
  return data.user;
}

export function logOut() { return supabase.auth.signOut(); }

export async function getMyProfile(uid) {
  const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  return data ? { uid: data.id, username: data.username, role: data.role, attendanceAccess: data.attendance_access } : null;
}

/** Superadmin-only: every account on file. */
export async function listAllUsers() {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) throw new Error(friendlyAuthError(error));
  return (data || []).map(u => ({ uid: u.id, username: u.username, role: u.role, attendanceAccess: u.attendance_access }));
}

/** Superadmin-only: grant or revoke attendance-sheet access for one user. */
export async function setAttendanceAccess(uid, allowed) {
  const { error } = await supabase.from('profiles').update({ attendance_access: !!allowed }).eq('id', uid);
  if (error) throw new Error(friendlyAuthError(error));
}

/* ------------------------------------------------------------------------
   Per-user overtime sheet (overtime_records) and the shared attendance
   roster (attendance_sheet) -- both stored as plain jsonb, so callers just
   hand over/receive a normal JS object. */
export async function getOvertimeRecord(uid) {
  const { data } = await supabase.from('overtime_records').select('data').eq('user_id', uid).maybeSingle();
  return data ? data.data : null;
}
export async function saveOvertimeRecord(uid, obj) {
  const { error } = await supabase.from('overtime_records')
    .upsert({ user_id: uid, data: obj, saved_at: new Date().toISOString() });
  if (error) console.error('Could not save the overtime sheet', error);
}

export async function getAttendanceSheet() {
  const { data } = await supabase.from('attendance_sheet').select('data').eq('id', 'shared').maybeSingle();
  return data ? data.data : null;
}
export async function saveAttendanceSheet(obj, savedByUsername) {
  const { error } = await supabase.from('attendance_sheet')
    .upsert({ id: 'shared', data: obj, saved_by: savedByUsername, saved_at: new Date().toISOString() });
  if (error) console.error('Could not sync the attendance sheet', error);
}
/** Calls back with the current data immediately, then again on every
    change anyone else with access makes. Returns an unsubscribe function. */
export function watchAttendanceSheet(cb) {
  getAttendanceSheet().then(data => { if (data) cb(data); });
  const channel = supabase.channel('attendance-sheet-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sheet', filter: 'id=eq.shared' },
        payload => { if (payload.new && payload.new.data) cb(payload.new.data); })
    .subscribe();
  return () => supabase.removeChannel(channel);
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
        <p class="sub">This site needs a Supabase project connected before anyone can sign in.</p>
        <div class="setup">Open <code>supabase-config.js</code> in the repo and follow the setup
        steps at the top of that file, then reload this page.</div></div>`;
      document.body.appendChild(div);
      return; // never resolves -- nothing works until it's configured
    }

    const div = document.createElement('div');
    div.id = 'authGate';
    div.innerHTML = gateHTML('login');
    document.body.appendChild(div);
    wireGate(div);

    let settled = false;
    const finish = async (user) => {
      if (settled || !user) return;
      settled = true;
      let profile = await getMyProfile(user.id);
      if (!profile) { // shouldn't normally happen, but don't strand a signed-in user with no row
        const username = (user.email || '').split('@')[0];
        await supabase.from('profiles').insert({ id: user.id, username, role: 'user', attendance_access: false });
        profile = await getMyProfile(user.id);
      }
      document.getElementById('authGate')?.remove();
      addAccountChip(profile);
      resolve({ user, profile });
    };

    supabase.auth.getSession().then(({ data }) => finish(data.session && data.session.user));
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { location.reload(); return; }
      finish(session && session.user);
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
      // requireAuth's onAuthStateChange/getSession takes it from here
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
