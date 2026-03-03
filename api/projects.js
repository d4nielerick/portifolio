const { authConfigured, verifyAdminToken } = require("../lib/auth");
const { getProjectsStore, saveProjectsStore } = require("../lib/projects-store");
const { getBearerToken, readJson, sendJson, setCors } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method === "GET") {
    try {
      const store = await getProjectsStore();
      return sendJson(res, 200, store);
    } catch (error) {
      return sendJson(res, 500, {
        error: "Falha ao carregar projetos.",
        detail: String(error?.message || error)
      });
    }
  }

  if (req.method === "PUT") {
    if (!authConfigured()) {
      return sendJson(res, 500, {
        error: "ADMIN_PIN/ADMIN_TOKEN_SECRET nao configurados no servidor."
      });
    }

    const token = getBearerToken(req);
    if (!verifyAdminToken(token)) {
      return sendJson(res, 401, { error: "Nao autorizado." });
    }

    const body = await readJson(req);
    const incoming = Array.isArray(body?.projects) ? body.projects : null;
    if (!incoming) {
      return sendJson(res, 400, { error: "Payload invalido. Envie { projects: [] }" });
    }

    try {
      const saved = await saveProjectsStore(incoming);
      return sendJson(res, 200, { ok: true, managed: saved.managed, count: saved.count });
    } catch (error) {
      return sendJson(res, 500, {
        error: "Falha ao salvar projetos.",
        detail: String(error?.message || error)
      });
    }
  }

  return sendJson(res, 405, { error: "Metodo nao permitido." });
};
