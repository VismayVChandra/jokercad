// A thin wrapper around Supabase (auth + a "projects" table) so projects
// follow a signed-in visitor across their own devices. The project URL and
// anon key come from the server's own /api/health (set once, in the site's
// own environment variables — see the README) — never asked of a visitor,
// since one jokercad deployment has exactly one Supabase project behind it,
// shared by everyone who signs in, each kept private by Supabase's Row Level
// Security. With no SUPABASE_URL/SUPABASE_ANON_KEY set on the server, every
// function here is a no-op and the app works exactly as it does with only
// this browser's local storage.
//
// This file knows nothing about jokercad's own project shape — the caller
// hands it a JSON-safe row to store and gets rows back to hydrate itself.

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

/** Fetches the server's sync config (if any) and connects. Call once at startup. */
export async function init() {
  let health;
  try {
    health = await (await fetch("/api/health")).json();
  } catch {
    return state(); // offline or unreachable — the rest of the app already handles this
  }
  if (health.sync && health.sync.url && health.sync.anon_key && window.supabase) {
    try {
      client = window.supabase.createClient(health.sync.url, health.sync.anon_key);
      client.auth.onAuthStateChange((_event, session) => {
        currentUser = session ? { id: session.user.id, email: session.user.email } : null;
        notify();
      });
    } catch {
      client = null;
    }
  }
  return state();
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
  if (!client) throw new Error("Sync isn't set up on this site.");
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
