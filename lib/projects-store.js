const fs = require("fs");
const path = require("path");

const PROJECTS_PATH = path.join(process.cwd(), "data", "projects.json");
const STORE_ID = "primary";
const STORE_CACHE_TTL_MS = Number(process.env.PROJECTS_CACHE_TTL_MS || 15000);

let cachedStore = null;
let cacheExpiresAt = 0;

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  const table = String(process.env.SUPABASE_PROJECTS_TABLE || "portfolio_projects");
  return {
    configured: Boolean(url && serviceRole),
    serviceRole,
    table,
    url
  };
}

function normalizeProjects(projects) {
  const incoming = Array.isArray(projects) ? projects : [];
  return incoming.map((project) => ({
    ...project,
    image: String(project?.image || ""),
    coverImage: String(project?.coverImage || ""),
    name: String(project?.name || ""),
    type: String(project?.type || ""),
    year: String(project?.year || ""),
    description: String(project?.description || ""),
    url: String(project?.url || ""),
    stack: Array.isArray(project?.stack) ? project.stack : []
  }));
}

function readLocalStore() {
  try {
    if (!fs.existsSync(PROJECTS_PATH)) {
      return { managed: false, projects: [] };
    }
    const raw = fs.readFileSync(PROJECTS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      managed: Boolean(parsed?.managed),
      projects: normalizeProjects(parsed?.projects)
    };
  } catch {
    return { managed: false, projects: [] };
  }
}

async function supabaseFetch(config, pathname, options = {}) {
  const response = await fetch(`${config.url}${pathname}`, {
    ...options,
    headers: {
      apikey: config.serviceRole,
      Authorization: `Bearer ${config.serviceRole}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  return response;
}

async function readSupabaseStore(config) {
  const query = `/rest/v1/${encodeURIComponent(config.table)}?id=eq.${STORE_ID}&select=managed,projects&limit=1`;
  const response = await supabaseFetch(config, query, { method: "GET" });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase read failed (${response.status}): ${detail.slice(0, 180)}`);
  }

  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    return { managed: false, projects: [] };
  }

  return {
    managed: Boolean(row?.managed),
    projects: normalizeProjects(row?.projects)
  };
}

async function writeSupabaseStore(config, nextStore) {
  const payload = [{
    id: STORE_ID,
    managed: Boolean(nextStore?.managed),
    projects: normalizeProjects(nextStore?.projects)
  }];

  const query = `/rest/v1/${encodeURIComponent(config.table)}?on_conflict=id`;
  const response = await supabaseFetch(config, query, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase write failed (${response.status}): ${detail.slice(0, 180)}`);
  }

  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  return {
    managed: Boolean(row?.managed),
    projects: normalizeProjects(row?.projects)
  };
}

async function getProjectsStore() {
  const now = Date.now();
  if (cachedStore && cacheExpiresAt > now) {
    return cachedStore;
  }

  const config = supabaseConfig();
  const localStore = readLocalStore();

  if (!config.configured) {
    cachedStore = localStore;
    cacheExpiresAt = now + STORE_CACHE_TTL_MS;
    return localStore;
  }

  try {
    const remoteStore = await readSupabaseStore(config);

    // First deploy/bootstrap: if remote is empty, seed from local defaults.
    if ((!remoteStore.managed && !remoteStore.projects.length) && localStore.projects.length) {
      const seededStore = await writeSupabaseStore(config, localStore);
      cachedStore = seededStore;
      cacheExpiresAt = now + STORE_CACHE_TTL_MS;
      return seededStore;
    }

    cachedStore = remoteStore;
    cacheExpiresAt = now + STORE_CACHE_TTL_MS;
    return remoteStore;
  } catch {
    // Keep site usable if Supabase is temporarily unavailable.
    if (localStore.projects.length) {
      cachedStore = localStore;
      cacheExpiresAt = now + STORE_CACHE_TTL_MS;
      return localStore;
    }
    cachedStore = { managed: false, projects: [] };
    cacheExpiresAt = now + STORE_CACHE_TTL_MS;
    return { managed: false, projects: [] };
  }
}

async function saveProjectsStore(projects) {
  const config = supabaseConfig();
  if (!config.configured) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configurados.");
  }

  const normalized = normalizeProjects(projects);
  const saved = await writeSupabaseStore(config, { managed: true, projects: normalized });
  cachedStore = saved;
  cacheExpiresAt = Date.now() + STORE_CACHE_TTL_MS;
  return {
    count: saved.projects.length,
    managed: saved.managed,
    projects: saved.projects
  };
}

module.exports = {
  getProjectsStore,
  normalizeProjects,
  saveProjectsStore,
  supabaseConfig
};
