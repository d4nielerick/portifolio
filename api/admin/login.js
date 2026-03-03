const { authConfigured, buildAdminToken, isValidAdminPin } = require("../../lib/auth");
const { readJson, sendJson, setCors } = require("../../lib/http");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Metodo nao permitido." });
  }

  if (!authConfigured()) {
    return sendJson(res, 500, {
      error: "ADMIN_PIN/ADMIN_TOKEN_SECRET nao configurados no servidor."
    });
  }

  const body = await readJson(req);
  const pin = String(body?.pin || "");

  if (!pin || !isValidAdminPin(pin)) {
    return sendJson(res, 401, { error: "PIN invalido." });
  }

  const token = buildAdminToken();
  return sendJson(res, 200, { ok: true, token });
};
