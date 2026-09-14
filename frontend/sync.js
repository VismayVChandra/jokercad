// A thin wrapper around Supabase (auth + a "projects" table) so projects
// follow the user across devices. Entirely optional: with no project URL and
// key saved, every function here is a no-op and the app works exactly as it
// does with only the browser's own local storage. See the README for the
// one-time Supabase setup (a free project, one SQL script, no coding).
//
// This file knows nothing about jokercad's own project shape — the caller
// hands it a JSON-safe row to store and gets rows back to hydrate itself.

const CONFIG_KEY = "jokercad-sync-config"; // { url, anonKey } in localStorage
const TABLE = "projects";

let client = null;
let currentUser = null; // { id, email } | null
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(state());
}

function state() {
  return { configured: Boolean(client), user: currentUser };
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function connect({ url, anonKey }) {
  if (!window.supabase) {
    // The CDN script (index.html) didn't load — sync stays off, nothing else breaks.
    client = null;
    return;
  }
  try {
    client = window.supabase.createClient(url, anonKey);
  } catch {
    client = null;
    return;
  }
  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? { id: session.user.id, email: session.user.email } : null;
    notify();
  });
}

/** Restores a saved config (if any) and starts watching sign-in state. Call once at startup. */
export function init() {
  const config = loadConfig();
  if (config) connect(config);
  return state();
}

/** Saves a Supabase project URL + anon key and connects. Throws on an obviously wrong value. */
export function setup(url, anonKey) {
  url = url.trim().replace(/\/+$/, "");
  anonKey = anonKey.trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
    throw new Error("That doesn't look like a Supabase project URL (should end in .supabase.co).");
  }
  if (anonKey.length < 20) throw new Error("That doesn't look like a valid anon key.");
  if (!window.supabase) {
    throw new Error("The sync library didn't load — check your connection (or an ad blocker) and reload the page.");
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, anonKey }));
  connect({ url, anonKey });
  if (!client) throw new Error("Couldn't connect. Double-check the URL and key and try again.");
  notify();
}

/** Disconnects and forgets the saved project URL/key. Never touches local project data. */
export function forget() {
  if (client) client.auth.signOut().catch(() => {});
  client = null;
  currentUser = null;
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {}
  notify();
}

export const isConfigured = () => Boolean(client);
export const currentUserOrNull = () => currentUser;

/** fn(state) is called now and again whenever configured/signed-in status changes. */
export function onChange(fn) {
  listeners.add(fn);
  fn(state());
  return () => listeners.delete(fn);
}

/** Emails a sign-in link; the user finishes signing in by clicking it. */
export async function signInWithEmail(email) {
  if (!client) throw new Error("Sync isn't set up yet.");
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}

export async function signOut() {
  if (client) await client.auth.signOut();
}

/** Creates or updates one project's cloud row. row must be JSON-safe (no Uint8Array). */
export async function pushProject(id, name, updatedAtMs, row) {
  if (!client || !currentUser) return;
  const { error } = await client
    .from(TABLE)
    .upsert({ id, user_id: currentUser.id, name, updated_at: new Date(updatedAtMs).toISOString(), data: row });
  if (error) throw error;
}

export async function deleteProject(id) {
  if (!client || !currentUser) return;
  const { error } = await client.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Every one of the signed-in user's cloud projects. */
export async function pullProjects() {
  if (!client || !currentUser) return [];
  const { data, error } = await client.from(TABLE).select("id,name,updated_at,data");
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    updatedAt: new Date(row.updated_at).getTime(),
    data: row.data,
  }));
}
