const {
  buildSystemPrompt,
  compactProject,
  detectIntent,
  loadPortfolioContext,
  selectRelevantProjects
} = require("../lib/portfolio-context");
const { readJson, sendJson, setCors } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Metodo nao permitido." });
  }

  const GROK_API_KEY = process.env.GROK_API_KEY;
  const GROK_API_URL = process.env.GROK_API_URL || "https://api.x.ai/v1/chat/completions";
  const GROK_MODEL = process.env.GROK_MODEL || "grok-4-1-fast-reasoning";

  try {
    if (!GROK_API_KEY) {
      return sendJson(res, 500, { error: "GROK_API_KEY nao configurada no servidor." });
    }

    const body = await readJson(req);
    const userMessage = String(body?.message || "").trim();
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!userMessage) {
      return sendJson(res, 400, { error: "Mensagem vazia." });
    }

    const context = loadPortfolioContext();
    const intent = detectIntent(userMessage);
    const relevantProjects = selectRelevantProjects(context.projects, userMessage, 4);
    const projectsContext = relevantProjects.map(compactProject);

    const sanitizedHistory = history
      .filter((item) => item && (item.role === "user" || item.role === "assistant"))
      .slice(-8)
      .map((item) => ({
        role: item.role,
        content: String(item.content || "").slice(0, 2000)
      }));

    const messages = [
      {
        role: "system",
        content: buildSystemPrompt(context, intent)
      },
      {
        role: "system",
        content: `Projetos relevantes para esta conversa:\n${JSON.stringify(projectsContext, null, 2)}`
      },
      ...sanitizedHistory,
      { role: "user", content: userMessage.slice(0, 3000) }
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18000);
    const upstream = await fetch(GROK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROK_API_KEY}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROK_MODEL,
        messages,
        temperature: 0.5
      })
    });
    clearTimeout(timeoutId);

    if (!upstream.ok) {
      return sendJson(res, 200, {
        reply:
          "Estou com instabilidade no assistente agora. Posso te ajudar com um resumo dos projetos ou te direcionar para contato."
      });
    }

    const data = await upstream.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) {
      return sendJson(res, 200, {
        reply:
          "Recebi uma resposta incompleta agora. Se quiser, me pergunte novamente em uma frase curta."
      });
    }

    return sendJson(res, 200, { reply });
  } catch {
    return sendJson(res, 200, {
      reply: "Tive uma falha temporaria para responder. Tente novamente em alguns segundos."
    });
  }
};
