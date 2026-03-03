const { sendJson, setCors } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Metodo nao permitido." });
  }

  return sendJson(res, 200, {
    ok: true,
    model: process.env.GROK_MODEL || "grok-4-1-fast-reasoning",
    hasApiKey: Boolean(process.env.GROK_API_KEY)
  });
};
