const crypto = require("crypto");

const ADMIN_PIN = () => String(process.env.ADMIN_PIN || "");
const ADMIN_TOKEN_SECRET = () => String(process.env.ADMIN_TOKEN_SECRET || "");

function authConfigured() {
  return Boolean(ADMIN_PIN() && ADMIN_TOKEN_SECRET());
}

function signTokenPayload(payload) {
  return crypto
    .createHmac("sha256", ADMIN_TOKEN_SECRET())
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
  if (!token || !authConfigured()) return false;

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

function isValidAdminPin(pin) {
  return String(pin || "") === ADMIN_PIN();
}

module.exports = {
  authConfigured,
  buildAdminToken,
  isValidAdminPin,
  verifyAdminToken
};
