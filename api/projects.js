const { authConfigured, verifyAdminToken } = require("../lib/auth");
const { getProjectsStore, saveProjectsStore } = require("../lib/projects-store");
const { getBearerToken, readJson, sendJson, setCors } = require("../lib/http");

const MAX_INLINE_CARD_IMAGE_LENGTH = Number(process.env.MAX_INLINE_CARD_IMAGE_LENGTH || 180000);

function getCardCoverImage(project) {
  const coverImage = String(project?.coverImage || "");
  if (!coverImage.startsWith("data:")) {
    return coverImage;
  }
  return coverImage.length <= MAX_INLINE_CARD_IMAGE_LENGTH ? coverImage : "";
}

function toCardProject(project) {
  return {
    id: String(project?.id || ""),
    custom: Boolean(project?.custom),
    name: String(project?.name || ""),
    year: String(project?.year || ""),
    thumbHeight: Number.isFinite(Number(project?.thumbHeight)) ? Number(project.thumbHeight) : 420,
    stack: Array.isArray(project?.stack) ? project.stack : [],
    type: String(project?.type || ""),
    description: String(project?.description || ""),
    coverImage: getCardCoverImage(project),
    image: "",
    url: String(project?.url || "")
  };
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method === "GET") {
    try {
      const store = await getProjectsStore();
      const view = String(req.query?.view || "");
      if (view === "cards") {
        res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
        const cardProjects = (store?.projects || []).map(toCardProject);
        return sendJson(res, 200, {
          managed: Boolean(store?.managed),
          projects: cardProjects
        });
      }
      res.setHeader("Cache-Control", "no-store");
      return sendJson(res, 200, store);
    } catch (error) {
      return sendJson(res, 500, {
        error: "Falha ao carregar projetos.",
        detail: String(error?.message || error)
      });
    }
  }

  if (req.method === "PUT") {
    res.setHeader("Cache-Control", "no-store");
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
    if (body?.__payloadTooLarge) {
      return sendJson(res, 413, {
        error: "Payload muito grande para salvar projetos. Reduza o tamanho das imagens."
      });
    }

    const incoming = Array.isArray(body?.projects) ? body.projects : null;
    if (!incoming) {
      return sendJson(res, 400, { error: "Payload invalido. Envie { projects: [] }" });
    }

    try {
      const existingStore = await getProjectsStore();
      const existingById = new Map(
        (existingStore?.projects || [])
          .filter((project) => project && project.id)
          .map((project) => [String(project.id), project])
      );

      const mergedProjects = incoming.map((project) => {
        const id = String(project?.id || "");
        const previous = existingById.get(id);
        const incomingImage = String(project?.image || "");
        const incomingCover = String(project?.coverImage || "");
        return {
          ...project,
          image: incomingImage || String(previous?.image || ""),
          coverImage:
            incomingCover ||
            String(previous?.coverImage || previous?.image || incomingImage || "")
        };
      });

      const saved = await saveProjectsStore(mergedProjects);
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
