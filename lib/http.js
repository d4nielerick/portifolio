function setCors(req, res) {
  const origin = process.env.FRONTEND_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }

  return new Promise((resolve) => {
    const maxBodyBytes = Number(process.env.API_MAX_BODY_BYTES || (8 * 1024 * 1024));
    let raw = "";
    let bytes = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      const part = String(chunk || "");
      bytes += Buffer.byteLength(part);
      if (bytes > maxBodyBytes) {
        tooLarge = true;
        return;
      }
      raw += part;
    });
    req.on("end", () => {
      if (tooLarge) {
        resolve({ __payloadTooLarge: true });
        return;
      }
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

module.exports = {
  getBearerToken,
  readJson,
  sendJson,
  setCors
};
