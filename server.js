const http = require("http");
const fs = require("fs");
const path = require("path");

const base = __dirname;
const htmlRoot = path.join(base, "HRMS Html");
const port = 3000;

const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
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
});
