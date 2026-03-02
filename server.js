const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);

const GROK_API_KEY = process.env.GROK_API_KEY;
const GROK_API_URL = process.env.GROK_API_URL || "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = process.env.GROK_MODEL || "grok-4-1-fast-reasoning";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
const ADMIN_PIN = String(process.env.ADMIN_PIN || "");
const ADMIN_TOKEN_SECRET = String(process.env.ADMIN_TOKEN_SECRET || "");
const CONTEXT_PATH = path.join(__dirname, "data", "portfolio-context.json");
const CHAT_LOG_PATH = path.join(__dirname, "logs", "chat.log");
const PROJECTS_PATH = path.join(__dirname, "data", "projects.json");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  }
}));

app.use("/api", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  return next();
});

function readProjectsStore() {
  try {
    if (!fs.existsSync(PROJECTS_PATH)) {
      return { managed: false, projects: [] };
    }
    const raw = fs.readFileSync(PROJECTS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      managed: Boolean(parsed?.managed),
      projects: Array.isArray(parsed?.projects) ? parsed.projects : []
    };
  } catch {
    return { managed: false, projects: [] };
  }
}

function writeProjectsStore(nextStore) {
  fs.mkdirSync(path.dirname(PROJECTS_PATH), { recursive: true });
  fs.writeFileSync(PROJECTS_PATH, JSON.stringify(nextStore, null, 2), "utf8");
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model: GROK_MODEL,
    hasApiKey: Boolean(GROK_API_KEY)
  });
});

app.get("/api/projects", (_req, res) => {
  const store = readProjectsStore();
  return res.json(store);
});

function signTokenPayload(payload) {
  return crypto
    .createHmac("sha256", ADMIN_TOKEN_SECRET)
    .update(payload)
    .digest("hex");
}

function buildAdminToken() {
  const expiresAt = Date.now() + (1000 * 60 * 60 * 12);
  const nonce = crypto.randomBytes(12).toString("hex");
  const payload = `${expiresAt}.${nonce}`;
  const signature = signTokenPayload(payload);
  return Buffer.from(`${payload}.${signature}`, "utf8").toString("base64url");
}

function verifyAdminToken(token) {
  if (!token) return false;

  try {
    const decoded = Buffer.from(String(token), "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 3) return false;

    const [expiresAtRaw, nonce, signature] = parts;
    const payload = `${expiresAtRaw}.${nonce}`;
    const expectedSignature = signTokenPayload(payload);
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const incomingBuffer = Buffer.from(String(signature), "utf8");
    if (expectedBuffer.length !== incomingBuffer.length) return false;
    if (!crypto.timingSafeEqual(expectedBuffer, incomingBuffer)) return false;

    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt)) return false;
    if (Date.now() > expiresAt) return false;

    return true;
  } catch {
    return false;
  }
}

function requireAdminAuth(req, res, next) {
  if (!ADMIN_PIN || !ADMIN_TOKEN_SECRET) {
    return res.status(500).json({
      error: "ADMIN_PIN/ADMIN_TOKEN_SECRET nao configurados no servidor."
    });
  }

  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Nao autorizado." });
  }

  return next();
}

app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_PIN || !ADMIN_TOKEN_SECRET) {
    return res.status(500).json({
      error: "ADMIN_PIN/ADMIN_TOKEN_SECRET nao configurados no servidor."
    });
  }

  const pin = String(req.body?.pin || "");
  if (!pin || pin !== ADMIN_PIN) {
    return res.status(401).json({ error: "PIN invalido." });
  }

  const token = buildAdminToken();
  return res.json({ ok: true, token });
});

app.put("/api/projects", requireAdminAuth, (req, res) => {
  const incoming = Array.isArray(req.body?.projects) ? req.body.projects : null;
  if (!incoming) {
    return res.status(400).json({ error: "Payload invalido. Envie { projects: [] }" });
  }

  const normalized = incoming.map((project) => ({
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

  writeProjectsStore({ managed: true, projects: normalized });
  return res.json({ ok: true, managed: true, count: normalized.length });
});

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

function appendChatLog(entry) {
  try {
    fs.mkdirSync(path.dirname(CHAT_LOG_PATH), { recursive: true });
    const line = `${JSON.stringify(entry)}\n`;
    fs.appendFileSync(CHAT_LOG_PATH, line, "utf8");
  } catch {
    // no-op
  }
}

app.post("/api/chat", async (req, res) => {
  try {
    if (!GROK_API_KEY) {
      return res.status(500).json({ error: "GROK_API_KEY nao configurada no servidor." });
    }

    const userMessage = String(req.body?.message || "").trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    if (!userMessage) {
      return res.status(400).json({ error: "Mensagem vazia." });
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
      const text = await upstream.text();
      appendChatLog({
        at: new Date().toISOString(),
        error: "upstream_not_ok",
        status: upstream.status,
        detail: text.slice(0, 400)
      });
      return res.json({
        reply:
          "Estou com instabilidade no assistente agora. Posso te ajudar com um resumo dos projetos ou te direcionar para contato."
      });
    }

    const data = await upstream.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) {
      appendChatLog({
        at: new Date().toISOString(),
        error: "invalid_reply_shape"
      });
      return res.json({
        reply:
          "Recebi uma resposta incompleta agora. Se quiser, me pergunte novamente em uma frase curta."
      });
    }

    appendChatLog({
      at: new Date().toISOString(),
      intent,
      userMessage,
      selectedProjects: projectsContext.map((project) => project.id || project.name),
      reply: String(reply).slice(0, 4000)
    });

    return res.json({ reply });
  } catch (error) {
    appendChatLog({
      at: new Date().toISOString(),
      error: String(error?.message || error)
    });
    return res.json({
      reply:
        "Tive uma falha temporaria para responder. Tente novamente em alguns segundos."
    });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
