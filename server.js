const http = require("http");
const fs = require("fs");
const path = require("path");

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .forEach((line) => {
      const [key, ...rest] = line.split("=");
      const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
      if (key && !(key in process.env)) process.env[key.trim()] = value;
    });
}

const base = __dirname;
const htmlRoot = path.join(base, "HRMS Html");
const publicUploadsRoot = path.join(base, "public-uploads");
loadDotEnv(path.join(base, ".env"));
const port = Number(process.env.PORT || 3000);
const DEFAULT_LOGO_PATH = path.join(htmlRoot, "assets", "logo.jpg");
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || "v22.0";

const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        reject(new Error("Invalid JSON payload"));
      }
    });
    req.on("error", (error) => reject(error));
  });
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeFileToken(input = "") {
  const cleaned = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || `file-${Date.now()}`;
}

function extensionFromFileName(fileName = "") {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (!ext) return "";
  return ext.replace(/[^a-z0-9.]/g, "");
}

function parseDataUrl(dataUrl = "") {
  const value = String(dataUrl || "").trim();
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    base64: match[2]
  };
}

function detectMimeFromExt(ext = "") {
  return mime[ext] || "application/octet-stream";
}

function normalizePhoneNumber(phone = "") {
  const cleaned = String(phone).replace(/[^\d]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("00")) return cleaned.slice(2);
  return cleaned;
}

function splitCaption(text = "") {
  const normalized = String(text || "").trim();
  if (normalized.length <= 1024) {
    return { caption: normalized, remainder: "" };
  }
  return {
    caption: normalized.slice(0, 1024),
    remainder: normalized.slice(1024)
  };
}

async function sendWhatsAppMessage(payload) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return { ok: false, status: 500, error: "WhatsApp API is not configured on server" };
  }

  const to = normalizePhoneNumber(payload?.to);
  const imageUrl = String(payload?.imageUrl || "").trim();
  const text = String(payload?.text || "").trim();

  if (!to) return { ok: false, status: 400, error: "Missing recipient phone" };
  const { caption, remainder } = splitCaption(text);
  const endpoint = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  let imagePayload = null;

  if (/^https?:\/\//i.test(imageUrl) && !/localhost|127\.0\.0\.1/i.test(imageUrl)) {
    imagePayload = { link: imageUrl };
  } else {
    if (!fs.existsSync(DEFAULT_LOGO_PATH)) {
      return { ok: false, status: 500, error: "Local logo file not found at HRMS Html/assets/logo.jpg" };
    }

    const mediaEndpoint = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/media`;
    const form = new FormData();
    const imageBuffer = fs.readFileSync(DEFAULT_LOGO_PATH);
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([imageBuffer], { type: "image/jpeg" }), "logo.jpg");

    const mediaResponse = await fetch(mediaEndpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      body: form
    });
    const mediaResult = await mediaResponse.json().catch(() => ({}));
    if (!mediaResponse.ok || !mediaResult?.id) {
      return {
        ok: false,
        status: mediaResponse.status || 500,
        error: mediaResult?.error?.message || "Failed to upload local logo to WhatsApp media API"
      };
    }
    imagePayload = { id: mediaResult.id };
  }

  const imageResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "image",
      image: {
        ...imagePayload,
        caption
      }
    })
  });

  const imageResult = await imageResponse.json().catch(() => ({}));
  if (!imageResponse.ok) {
    return {
      ok: false,
      status: imageResponse.status,
      error: imageResult?.error?.message || "Failed to send WhatsApp image"
    };
  }

  if (!remainder) {
    return { ok: true, status: 200, data: imageResult };
  }

  const textResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: remainder
      }
    })
  });

  const textResult = await textResponse.json().catch(() => ({}));
  if (!textResponse.ok) {
    return {
      ok: false,
      status: textResponse.status,
      error: textResult?.error?.message || "Image sent but text continuation failed"
    };
  }

  return { ok: true, status: 200, data: { image: imageResult, text: textResult } };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/public-upload") {
    try {
      const payload = await readJsonBody(req);
      const parsed = parseDataUrl(payload?.dataUrl);
      if (!parsed) {
        return sendJson(res, 400, { ok: false, error: "Invalid dataUrl payload" });
      }

      const rawName = String(payload?.fileName || "attachment").trim();
      const ext = extensionFromFileName(rawName) || ".bin";
      const mimeType = String(payload?.mimeType || parsed.mimeType || detectMimeFromExt(ext)).trim();
      const bytes = Buffer.from(parsed.base64, "base64");
      if (!bytes.length) {
        return sendJson(res, 400, { ok: false, error: "Decoded file is empty" });
      }
      if (bytes.length > 12 * 1024 * 1024) {
        return sendJson(res, 413, { ok: false, error: "File too large (max 12MB)" });
      }

      ensureDirectory(publicUploadsRoot);
      const now = new Date();
      const folder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const targetDir = path.join(publicUploadsRoot, folder);
      ensureDirectory(targetDir);

      const baseName = safeFileToken(path.basename(rawName, ext));
      const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${baseName}${ext}`;
      const storedPath = path.join(targetDir, storedName);
      fs.writeFileSync(storedPath, bytes);

      const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim() || "http";
      const host = String(req.headers["x-forwarded-host"] || req.headers.host || `localhost:${port}`).split(",")[0].trim();
      const publicPath = `/public-uploads/${folder}/${storedName}`;
      const publicUrl = `${proto}://${host}${publicPath}`;

      return sendJson(res, 200, {
        ok: true,
        data: {
          url: publicUrl,
          path: publicPath,
          fileName: rawName,
          mimeType
        }
      });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error?.message || "Upload failed" });
    }
  }

  if (req.method === "POST" && req.url === "/api/whatsapp/send-image") {
    try {
      const payload = await readJsonBody(req);
      const result = await sendWhatsAppMessage(payload);
      if (!result.ok) {
        return sendJson(res, result.status || 500, { ok: false, error: result.error });
      }
      return sendJson(res, 200, { ok: true, data: result.data });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error?.message || "Internal error" });
    }
  }

  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const resolved = urlPath === "/" ? "/HRMS Html/dashboard.html" : urlPath;
  let filePath = path.join(base, resolved);
  if (!filePath.startsWith(base)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath)) {
    const fallbackPath = path.join(htmlRoot, resolved.replace(/^\/+/, ""));
    if (fallbackPath.startsWith(htmlRoot) && fs.existsSync(fallbackPath)) {
      filePath = fallbackPath;
    }
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      const errorPage = path.join(htmlRoot, "error.html");
      fs.readFile(errorPage, (errorPageErr, errorData) => {
        if (errorPageErr) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end(errorData);
      });
      return;
    }
    res.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "text/plain" });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`HRMS server running at http://localhost:${port}`);
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.log("WhatsApp API not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in environment or .env");
  }
});
