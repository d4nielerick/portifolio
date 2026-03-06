const { getProjectsStore } = require("../lib/projects-store");
const { sendJson, setCors } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Metodo nao permitido." });
  }

  const id = String(req.query?.id || "").trim();
  if (!id) {
    return sendJson(res, 400, { error: "Parametro id obrigatorio." });
  }

  try {
    const store = await getProjectsStore();
    const project = (store?.projects || []).find((item) => String(item?.id || "") === id);

    if (!project) {
      return sendJson(res, 404, { error: "Projeto nao encontrado." });
    }

    return sendJson(res, 200, { project });
  } catch (error) {
    return sendJson(res, 500, {
      error: "Falha ao carregar projeto.",
      detail: String(error?.message || error)
    });
  }
};
