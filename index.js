import express from "express";
import fs from "fs";
import path from "path";
import { fork } from "child_process";
import http from "http";
import { Server } from "socket.io";

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();
const USERS_DIR = path.join(__dirname, "users");
if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const procs = {};

function appendLog(uid, text) {
  try {
    const userDir = path.join(USERS_DIR, String(uid));
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    fs.appendFileSync(path.join(userDir, "logs.txt"), `[${new Date().toISOString()}] ${text}\n`);
  } catch (e) {
    console.error("appendLog failed:", e.message);
  }
}

io.on("connection", (socket) => {
  socket.on("join", (uid) => socket.join(String(uid)));
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.post("/start-bot", (req, res) => {
  const admin = req.body.admin;
  const appstate = req.body.appstate;
  if (!admin || !appstate) return res.status(400).send("❌ admin/appstate missing");
  if (procs[admin]) return res.send(`⚠️ Bot already running for admin ${admin}`);

  const userDir = path.join(USERS_DIR, String(admin));
  const appStatePath = path.join(userDir, "appstate.json");
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(appStatePath, appstate);

  const child = fork("bot.js", [admin], { cwd: path.resolve(), stdio: ["pipe", "pipe", "pipe", "ipc"] });

  child.stdout.on("data", (d) => {
    const text = d.toString().trim();
    appendLog(admin, text);
    io.to(String(admin)).emit("botlog", text);
  });
  child.stderr.on("data", (d) => {
    const text = d.toString().trim();
    appendLog(admin, "[ERR] " + text);
    io.to(String(admin)).emit("botlog", "[ERR] " + text);
  });
  child.on("message", (msg) => { // Handle messages from bot.js
    if (msg.type === "botlog") {
      appendLog(admin, msg.text);
      io.to(String(admin)).emit("botlog", msg.text);
    }
  });
  child.on("exit", (code, sig) => {
    const msg = `🔴 Bot exited (code=${code}, sig=${sig})`;
    appendLog(admin, msg);
    io.to(String(admin)).emit("botlog", msg);
    delete procs[admin];
  });

  procs[admin] = child;
  appendLog(admin, `✅ Bot started for admin ${admin}`);
  io.to(String(admin)).emit("botlog", `✅ Bot started for ${admin}`);
  res.send(`✅ started ${admin}`);
});

app.get("/stop-bot", (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.status(400).send("❌ uid missing");
  if (!procs[uid]) return res.send("⚠️ Bot not running");
  procs[uid].kill();
  delete procs[uid];
  appendLog(uid, "🔴 Bot stopped by panel");
  io.to(String(uid)).emit("botlog", "🔴 Bot stopped by panel");
  res.send("🔴 stopped");
});

app.get("/logs", (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.status(400).send("❌ uid missing");
  const logPath = path.join(USERS_DIR, String(uid), "logs.txt");
  if (!fs.existsSync(logPath)) return res.send("⚠️ No logs found.");
  const logs = fs.readFileSync(logPath, "utf8");
  res.send(logs);
});

// NEW API ENDPOINTS for Bot Actions
function checkBotRunning(uid, res) {
    if (!uid) { res.status(400).send("❌ uid missing"); return false; }
    if (!procs[uid]) { res.send("⚠️ Bot not running"); return false; }
    return true;
}

app.post("/bot-action", (req, res) => {
    const { uid, action, threadID, value } = req.body;
    if (!checkBotRunning(uid, res)) return;
    
    // Send action to bot.js via IPC
    procs[uid].send({ action, threadID, value });
    
    res.send(`✅ Action ${action} sent to bot for thread ${threadID}`);
});

server.listen(PORT, () => console.log(`🌐 Server running on http://localhost:${PORT}`));
