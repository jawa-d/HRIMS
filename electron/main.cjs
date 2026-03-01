const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const PORT = process.env.PORT || "3000";
const APP_URL = `http://localhost:${PORT}/HRMS%20Html/login.html`;
let serverProcess = null;

function waitForServer(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error("Server did not start in time."));
          return;
        }
        setTimeout(tryConnect, 300);
      });
      req.setTimeout(1000, () => req.destroy());
    };
    tryConnect();
  });
}

function startLocalServer() {
  if (serverProcess) return;
  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, PORT },
    stdio: ["ignore", "pipe", "pipe"]
  });

  serverProcess.stdout.on("data", (chunk) => {
    process.stdout.write(chunk.toString());
  });
  serverProcess.stderr.on("data", (chunk) => {
    process.stderr.write(chunk.toString());
  });
  serverProcess.on("exit", () => {
    serverProcess = null;
  });
}

function stopLocalServer() {
  if (!serverProcess) return;
  try {
    serverProcess.kill();
  } catch (_) {
    // Ignore process kill errors.
  }
  serverProcess = null;
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://localhost:${PORT}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(APP_URL);
}

app.whenReady().then(async () => {
  startLocalServer();
  try {
    await waitForServer(`http://localhost:${PORT}`);
  } catch (error) {
    console.error(error.message);
    app.quit();
    return;
  }
  createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopLocalServer();
});
