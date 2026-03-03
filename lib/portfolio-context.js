const fs = require("fs");
const path = require("path");

const CONTEXT_PATH = path.join(process.cwd(), "data", "portfolio-context.json");

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value).split(" ").filter((token) => token.length > 2);
}

function loadPortfolioContext() {
  try {
    if (!fs.existsSync(CONTEXT_PATH)) {
      return { profile: {}, projects: [], faqs: [] };
    }
    const raw = fs.readFileSync(CONTEXT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      profile: parsed?.profile || {},
      projects: Array.isArray(parsed?.projects) ? parsed.projects : [],
      faqs: Array.isArray(parsed?.faqs) ? parsed.faqs : []
    };
  } catch {
    return { profile: {}, projects: [], faqs: [] };
  }
}

function detectIntent(message) {
  const m = normalizeText(message);
  if (/(orcamento|preco|valor|custo|quanto custa)/.test(m)) return "pricing";
  if (/(prazo|tempo|entrega|quando)/.test(m)) return "timeline";
  if (/(stack|tecnologia|react|vue|next|node|typescript)/.test(m)) return "stack";
  if (/(contato|falar|whatsapp|email)/.test(m)) return "contact";
  if (/(projeto|portfolio|site|case)/.test(m)) return "portfolio";
  return "general";
}

function scoreProjectRelevance(project, queryTokens) {
  const haystack = tokenize([
    project?.name,
    project?.type,
    project?.description,
    Array.isArray(project?.stack) ? project.stack.join(" ") : "",
    project?.year
  ].join(" "));

  if (!haystack.length || !queryTokens.length) return 0;
  const bag = new Set(haystack);
  let score = 0;
  queryTokens.forEach((token) => {
    if (bag.has(token)) score += 1;
  });
  return score;
}

function selectRelevantProjects(projects, userMessage, maxItems = 4) {
  const queryTokens = tokenize(userMessage);
  if (!queryTokens.length) return projects.slice(0, maxItems);

  return [...projects]
    .map((project) => ({
      project,
      score: scoreProjectRelevance(project, queryTokens)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map((item) => item.project);
}

function compactProject(project) {
  return {
    id: project?.id || "",
    name: project?.name || "",
    type: project?.type || "",
    year: project?.year || "",
    stack: Array.isArray(project?.stack) ? project.stack : [],
    description: project?.description || "",
    url: project?.url || ""
  };
}

function buildSystemPrompt(context, intent) {
  const profile = context.profile || {};
  const faqLines = (context.faqs || [])
    .slice(0, 8)
    .map((faq) => `- Pergunta: ${faq.question || ""} | Resposta: ${faq.answer || ""}`)
    .join("\n");

  const intentGuidance = {
    pricing: "Se perguntarem preco, de faixa estimada e convide para briefing curto.",
    timeline: "Se perguntarem prazo, responda com janelas de entrega por complexidade.",
    stack: "Se perguntarem stack, cite stacks reais dos projetos fornecidos.",
    contact: "Se perguntarem contato, priorize os canais definidos no perfil.",
    portfolio: "Se perguntarem portfolio, destaque 2-3 projetos mais alinhados.",
    general: "Responda com objetividade e direcione para proximo passo."
  };

  return [
    "Voce e o assistente oficial do portfolio.",
    "Idioma: portugues do Brasil.",
    "Tom: objetivo, amigavel, direto ao ponto.",
    "Regra: nao invente informacao fora do contexto.",
    "Quando faltar dado, diga claramente e proponha acao.",
    "Sempre que fizer sentido, encaminhe para contato.",
    "",
    `Nome profissional: ${profile.name || "Nao informado"}`,
    `Especialidade: ${profile.specialty || "Desenvolvimento web"}`,
    `Resumo: ${profile.bio || ""}`,
    `Contato principal: ${profile.contact || "Nao informado"}`,
    "",
    `Diretriz por intencao atual (${intent}): ${intentGuidance[intent] || intentGuidance.general}`,
    "",
    "FAQ base:",
    faqLines || "- Sem FAQ cadastrada."
  ].join("\n");
}

module.exports = {
  buildSystemPrompt,
  compactProject,
  detectIntent,
  loadPortfolioContext,
  selectRelevantProjects
};
