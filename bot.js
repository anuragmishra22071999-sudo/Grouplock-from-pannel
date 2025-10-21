import fs from "fs";
import path from "path";
import ws3 from "ws3-fca";
import express from "express";
import http from "http";
import https from "https";

const login = typeof ws3 === "function" ? ws3 : (ws3.default || ws3.login || ws3);
const ADMIN_ARG = process.argv[2];
if (!ADMIN_ARG) {
  console.error("❌ Usage: node bot.js <adminUID>");
  process.exit(1);
}

const ROOT = process.cwd();
const USER_DIR = path.join(ROOT, "users", String(ADMIN_ARG));
const APPSTATE_PATH = path.join(USER_DIR, "appstate.json");
const ADMIN_PATH = path.join(USER_DIR, "admin.txt");
const LOCKS_PATH = path.join(USER_DIR, "locks.json");

if (!fs.existsSync(USER_DIR)) {
  console.error("❌ User folder not found:", USER_DIR);
  process.exit(1);
}

let appState;
try {
  appState = JSON.parse(fs.readFileSync(APPSTATE_PATH, "utf8"));
} catch (e) {
  console.error("❌ appstate.json read fail:", e.message);
  process.exit(1);
}

let BOSS_UID = ADMIN_ARG;
try {
  if (fs.existsSync(ADMIN_PATH)) {
    const t = fs.readFileSync(ADMIN_PATH, "utf8").trim();
    if (t) BOSS_UID = t;
  }
} catch {}

let locks = {
  groupNames: {},
  nicknames: {},
  antiOut: true,
  messageBlock: {} // NEW: For message blocking
};
try {
  if (fs.existsSync(LOCKS_PATH)) locks = JSON.parse(fs.readFileSync(LOCKS_PATH, "utf8"));
} catch {}

function saveLocks() {
  try {
    fs.writeFileSync(LOCKS_PATH, JSON.stringify(locks, null, 2));
  } catch (e) {
    console.error("❌ Save locks error:", e.message);
  }
}

// Function to send log back to index.js
const ipcLog = (msg) => {
  if (process.send) {
    process.send({ type: "botlog", text: msg });
  } else {
    console.log(msg);
  }
};
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----- Nickname Queue Fix (Unchanged) -----
const nickQueue = [];
let processing = false;
const NICK_DELAY = 500;

function enqueueNick(fn) {
  nickQueue.push(fn);
  if (!processing) processNickQueue();
}

async function processNickQueue() {
  processing = true;
  while (nickQueue.length) {
    const fn = nickQueue.shift();
    try {
      await fn();
    } catch (e) {
      log("❌ Nick task error: " + e.message);
    }
    await sleep(NICK_DELAY);
  }
  processing = false;
}

async function retryChangeNick(api, threadID, uid, nick) {
  enqueueNick(() => new Promise((resolve) => {
    api.changeNickname(nick, threadID, uid, (err) => {
      if (err) log(`⚠️ Failed to change nick for ${uid}`);
      resolve();
    });
  }));
}

async function revertNick(api, threadID, uid) {
  const lockedNick = locks.nicknames?.[threadID]?.[uid];
  if (!lockedNick) return;
  await retryChangeNick(api, threadID, uid, lockedNick);
  ipcLog(`🔁 Reverted nick for ${uid}`);
}

async function applyNickLock(api, threadID, nick) {
  try {
    const info = await api.getThreadInfo(threadID);
    const members = info?.participantIDs || [];
    locks.nicknames[threadID] = {};
    for (const uid of members) {
      locks.nicknames[threadID][uid] = nick;
      await retryChangeNick(api, threadID, uid, nick);
    }
    saveLocks();
    ipcLog(`🔐 Nick lock applied in ${threadID} as "${nick}"`);
  } catch (e) {
    ipcLog("❌ Apply Nick Lock failed: " + e.message);
  }
}

async function removeNickLock(api, threadID) {
  try {
    const locked = locks.nicknames[threadID];
    if (locked) {
      for (const uid of Object.keys(locked)) await retryChangeNick(api, threadID, uid, "");
      delete locks.nicknames[threadID];
      saveLocks();
      ipcLog(`🔓 Nicknames unlocked in ${threadID}.`);
    } else {
      ipcLog(`⚠️ No nick lock found in ${threadID}.`);
    }
  } catch (e) {
    ipcLog("❌ Remove Nick Lock failed: " + e.message);
  }
}
import fs from "fs";
import path from "path";
import ws3 from "ws3-fca";
import express from "express";
import http from "http";
import https from "https";

const login = typeof ws3 === "function" ? ws3 : (ws3.default || ws3.login || ws3);
const ADMIN_ARG = process.argv[2];
if (!ADMIN_ARG) {
  console.error("❌ Usage: node bot.js <adminUID>");
  process.exit(1);
}

const ROOT = process.cwd();
const USER_DIR = path.join(ROOT, "users", String(ADMIN_ARG));
const APPSTATE_PATH = path.join(USER_DIR, "appstate.json");
const ADMIN_PATH = path.join(USER_DIR, "admin.txt");
const LOCKS_PATH = path.join(USER_DIR, "locks.json");

if (!fs.existsSync(USER_DIR)) {
  console.error("❌ User folder not found:", USER_DIR);
  process.exit(1);
}

let appState;
try {
  appState = JSON.parse(fs.readFileSync(APPSTATE_PATH, "utf8"));
} catch (e) {
  console.error("❌ appstate.json read fail:", e.message);
  process.exit(1);
}

let BOSS_UID = ADMIN_ARG;
try {
  if (fs.existsSync(ADMIN_PATH)) {
    const t = fs.readFileSync(ADMIN_PATH, "utf8").trim();
    if (t) BOSS_UID = t;
  }
} catch {}

let locks = {
  groupNames: {},
  nicknames: {},
  antiOut: true,
  messageBlock: {} // NEW: For message blocking
};
try {
  if (fs.existsSync(LOCKS_PATH)) locks = JSON.parse(fs.readFileSync(LOCKS_PATH, "utf8"));
} catch {}

function saveLocks() {
  try {
    fs.writeFileSync(LOCKS_PATH, JSON.stringify(locks, null, 2));
  } catch (e) {
    console.error("❌ Save locks error:", e.message);
  }
}

// Function to send log back to index.js
const ipcLog = (msg) => {
  if (process.send) {
    process.send({ type: "botlog", text: msg });
  } else {
    console.log(msg);
  }
};
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----- Nickname Queue Fix (Unchanged) -----
const nickQueue = [];
let processing = false;
const NICK_DELAY = 500;

function enqueueNick(fn) {
  nickQueue.push(fn);
  if (!processing) processNickQueue();
}

async function processNickQueue() {
  processing = true;
  while (nickQueue.length) {
    const fn = nickQueue.shift();
    try {
      await fn();
    } catch (e) {
      log("❌ Nick task error: " + e.message);
    }
    await sleep(NICK_DELAY);
  }
  processing = false;
}

async function retryChangeNick(api, threadID, uid, nick) {
  enqueueNick(() => new Promise((resolve) => {
    api.changeNickname(nick, threadID, uid, (err) => {
      if (err) log(`⚠️ Failed to change nick for ${uid}`);
      resolve();
    });
  }));
}

async function revertNick(api, threadID, uid) {
  const lockedNick = locks.nicknames?.[threadID]?.[uid];
  if (!lockedNick) return;
  await retryChangeNick(api, threadID, uid, lockedNick);
  ipcLog(`🔁 Reverted nick for ${uid}`);
}

async function applyNickLock(api, threadID, nick) {
  try {
    const info = await api.getThreadInfo(threadID);
    const members = info?.participantIDs || [];
    locks.nicknames[threadID] = {};
    for (const uid of members) {
      locks.nicknames[threadID][uid] = nick;
      await retryChangeNick(api, threadID, uid, nick);
    }
    saveLocks();
    ipcLog(`🔐 Nick lock applied in ${threadID} as "${nick}"`);
  } catch (e) {
    ipcLog("❌ Apply Nick Lock failed: " + e.message);
  }
}

async function removeNickLock(api, threadID) {
  try {
    const locked = locks.nicknames[threadID];
    if (locked) {
      for (const uid of Object.keys(locked)) await retryChangeNick(api, threadID, uid, "");
      delete locks.nicknames[threadID];
      saveLocks();
      ipcLog(`🔓 Nicknames unlocked in ${threadID}.`);
    } else {
      ipcLog(`⚠️ No nick lock found in ${threadID}.`);
    }
  } catch (e) {
    ipcLog("❌ Remove Nick Lock failed: " + e.message);
  }
}

// ----- Group Name Lock/Unlock -----
async function applyGroupNameLock(api, threadID, name) {
  locks.groupNames[threadID] = name;
  saveLocks();
  await api.setTitle(name, threadID);
  ipcLog(`✅ Group name locked in ${threadID}: ${name}`);
}

async function removeGroupNameLock(threadID) {
  delete locks.groupNames[threadID];
  saveLocks();
  ipcLog(`🔓 Group name unlocked in ${threadID}.`);
}

// ----- Message Block Toggle -----
async function toggleMessageBlock(api, threadID, state) {
  if (state === 'on') {
    locks.messageBlock[threadID] = true;
    ipcLog(`🛑 Message blocking ON in ${threadID}.`);
  } else {
    delete locks.messageBlock[threadID];
    ipcLog(`🟢 Message blocking OFF in ${threadID}.`);
  }
  saveLocks();
}

// ----- Keepalive (Unchanged) -----
try {
  const app = express();
  app.get("/", (req, res) => res.send("✅ ANURAG BOT ACTIVE"));
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => log(`🌐 Keepalive running on port ${PORT}`));
} catch (e) {
  log("⚠️ Keepalive failed: " + e.message);
}

process.on("uncaughtException", e => log("⛔ uncaughtException: " + e.message));
process.on("unhandledRejection", e => log("⛔ unhandledRejection: " + e.message));

// ------------------ IPC HANDLER (NEW) ------------------
process.on("message", async (msg) => {
  const { action, threadID, value } = msg;
  try {
    switch (action) {
      case "groupNameLock":
        await applyGroupNameLock(api, threadID, value);
        break;
      case "groupNameUnlock":
        await removeGroupNameLock(threadID);
        break;
      case "nickLockApply":
        await applyNickLock(api, threadID, value);
        break;
      case "nickLockRemove":
        await removeNickLock(api, threadID);
        break;
      case "messageBlockOn":
        await toggleMessageBlock(api, threadID, 'on');
        break;
      case "messageBlockOff":
        await toggleMessageBlock(api, threadID, 'off');
        break;
      default:
        ipcLog(`⚠️ Unknown action received: ${action}`);
    }
  } catch (e) {
    ipcLog(`❌ IPC action ${action} failed: ${e.message}`);
  }
});

// ------------------ LOGIN ------------------
let api; // Make api globally accessible for the IPC handler
login({ appState }, async (err, clientApi) => {
  if (err) {
    console.error("❌ Login failed:", err);
    process.exit(1);
  }
  api = clientApi; // Set the global api
  api.setOptions({ listenEvents: true, selfListen: false });
  ipcLog("🤖 ANURAG BOT ONLINE");

  setInterval(saveLocks, 60000);

  const deletedMsgs = new Map(); // track anti-delete

  api.listenMqtt(async (err, event) => {
    if (err || !event) return;
    const threadID = String(event.threadID || "");
    const senderID = String(event.senderID || "");

    try {
      // --------- ANTI OUT (Unchanged) ---------
      if (event.type === "event" && event.logMessageType === "log:unsubscribe") {
        const leftUID = event.logMessageData.leftParticipantFbId;
        if (locks.antiOut && leftUID && leftUID !== api.getCurrentUserID()) {
          try {
            await api.addUserToGroup(leftUID, threadID);
            await api.sendMessage(`🚫 Anti-Out Active!\n${leftUID} ko wapas add kar diya 😎`, threadID);
            ipcLog(`🔁 Added back ${leftUID} to ${threadID}`);
          } catch (e) {
            ipcLog("⚠️ Failed to re-add user: " + e.message);
          }
        }
        return;
      }

      // --------- MESSAGE BLOCK (NEW) ---------
      if (event.type === "message" && locks.messageBlock[threadID] && senderID !== BOSS_UID) {
        // Only block messages if lock is ON and sender is NOT the boss
        api.deleteMessage(event.messageID);
        ipcLog(`🚫 Blocked message from ${senderID} in ${threadID}.`);
        return; // Stop further processing for blocked messages
      }

      // --------- ANTI DELETE (Unchanged) ---------
      if (event.type === "message") {
        if (event.body) {
          deletedMsgs.set(event.messageID, {
            senderID,
            body: event.body,
          });
          if (deletedMsgs.size > 300) {
            const firstKey = deletedMsgs.keys().next().value;
            deletedMsgs.delete(firstKey);
          }
        }
        return;
      }

      if (event.type === "message_unsend") {
        const data = deletedMsgs.get(event.messageID);
        if (data) {
          const info = await api.getUserInfo(data.senderID);
          const name = info?.[data.senderID]?.name || "Someone";
          await api.sendMessage(
            `👀 ${name} ne ek message delete kiya:\n“${data.body}”`,
            event.threadID
          );
          deletedMsgs.delete(event.messageID);
        } else {
          await api.sendMessage(`👀 Koi message delete hua (content unknown)`, event.threadID);
        }
        return;
      }

      // --------- COMMANDS (Unchanged, but now also using ipcLog) ---------
      if (event.type !== "message" || senderID !== BOSS_UID) return;
      const body = event.body?.trim();
      if (!body) return;

      const parts = body.split(/\s+/);
      const cmd = parts[0].replace(/^\//, "").toLowerCase();
      const args = parts.slice(1);

      // /anurag help
      if (cmd === "anurag") {
        return api.sendMessage(
`👑 *ANURAG BOT COMMANDS* 👑

/groupname on <name> → Lock group name
/groupname off → Unlock name
/nicknames on <nick> → Lock all nicknames
/nicknames off → Unlock all nicknames
/antiout on|off → Toggle anti-out
/blockmsg on|off → Toggle message blocking (NEW)

🔰 Made by Anurag Mishra 💖`,
          threadID
        );
      }
      
      // blockmsg (NEW COMMAND)
      if (cmd === "blockmsg") {
        const sub = (args[0] || "").toLowerCase();
        if (sub === "on") {
          await toggleMessageBlock(api, threadID, 'on');
          return api.sendMessage("🛑 Message blocking enabled in this group.", threadID);
        }
        if (sub === "off") {
          await toggleMessageBlock(api, threadID, 'off');
          return api.sendMessage("🟢 Message blocking disabled.", threadID);
        }
        return api.sendMessage(`🧠 Message blocking is ${locks.messageBlock[threadID] ? "ON" : "OFF"}`, threadID);
      }

      // groupname
      if (cmd === "groupname") {
        const sub = (args[0] || "").toLowerCase();
        if (sub === "on") {
          const name = args.slice(1).join(" ");
          if (!name) return api.sendMessage("⚠️ Usage: /groupname on <name>", threadID);
          await applyGroupNameLock(api, threadID, name);
          return api.sendMessage(`✅ Group name locked: ${name}`, threadID);
        }
        if (sub === "off") {
          await removeGroupNameLock(threadID);
          return api.sendMessage("🔓 Group name unlocked.", threadID);
        }
      }

      // nicknames
      if (cmd === "nicknames") {
        const sub = (args[0] || "").toLowerCase();
        if (sub === "on") {
          const nick = args.slice(1).join(" ");
          if (!nick) return api.sendMessage("⚠️ Usage: /nicknames on <nick>", threadID);
          await applyNickLock(api, threadID, nick);
          return api.sendMessage(`🔐 All nicknames locked as "${nick}"`, threadID);
        }
        if (sub === "off") {
          await removeNickLock(api, threadID);
          return api.sendMessage("🔓 Nicknames unlocked.", threadID);
        }
      }

      // antiout toggle
      if (cmd === "antiout") {
        const sub = (args[0] || "").toLowerCase();
        if (sub === "on") {
          locks.antiOut = true;
          saveLocks();
          return api.sendMessage("🛡️ Anti-Out enabled.", threadID);
        }
        if (sub === "off") {
          locks.antiOut = false;
          saveLocks();
          return api.sendMessage("🚫 Anti-Out disabled.", threadID);
        }
        return api.sendMessage(`🧠 Anti-Out is ${locks.antiOut ? "ON" : "OFF"}`, threadID);
      }

      // ----- Group name revert check -----
      if (event.type === "event" && event.logMessageType === "log:thread-name") {
        const lockedName = locks.groupNames[threadID];
        const newName = event.logMessageData?.name;
        if (lockedName && newName !== lockedName) {
          await api.setTitle(lockedName, threadID);
          ipcLog(`🔒 Group name reverted in ${threadID}`);
        }
      }

      // ----- Nick change revert -----
      if (event.type === "event" && event.logMessageType === "log:user-nickname") {
        const uid = event.logMessageData?.participant_id;
        const newNick = event.logMessageData?.nickname;
        if (locks.nicknames?.[threadID]?.[uid] && newNick !== locks.nicknames[threadID][uid])
          await revertNick(api, threadID, uid);
      }

    } catch (e) {
      ipcLog("❌ Event error: " + e.message);
    }
  });
});
￼Enter
// ----- Group Name Lock/Unlock -----
async function applyGroupNameLock(api, threadID, name) {
  locks.groupNames[threadID] = name;
  saveLocks();
  await api.setTitle(name, threadID);
  ipcLog(`✅ Group name locked in ${threadID}: ${name}`);
}

async function removeGroupNameLock(threadID) {
  delete locks.groupNames[threadID];
  saveLocks();
  ipcLog(`🔓 Group name unlocked in ${threadID}.`);
}

// ----- Message Block Toggle -----
async function toggleMessageBlock(api, threadID, state) {
  if (state === 'on') {
    locks.messageBlock[threadID] = true;
    ipcLog(`🛑 Message blocking ON in ${threadID}.`);
  } else {
    delete locks.messageBlock[threadID];
    ipcLog(`🟢 Message blocking OFF in ${threadID}.`);
  }
  saveLocks();
}

// ----- Keepalive (Unchanged) -----
try {
  const app = express();
  app.get("/", (req, res) => res.send("✅ ANURAG BOT ACTIVE"));
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => log(`🌐 Keepalive running on port ${PORT}`));
} catch (e) {
  log("⚠️ Keepalive failed: " + e.message);
}

process.on("uncaughtException", e => log("⛔ uncaughtException: " + e.message));
process.on("unhandledRejection", e => log("⛔ unhandledRejection: " + e.message));

// ------------------ IPC HANDLER (NEW) ------------------
process.on("message", async (msg) => {
  const { action, threadID, value } = msg;
  try {
    switch (action) {
      case "groupNameLock":
        await applyGroupNameLock(api, threadID, value);
        break;
      case "groupNameUnlock":
        await removeGroupNameLock(threadID);
        break;
      case "nickLockApply":
        await applyNickLock(api, threadID, value);
        break;
      case "nickLockRemove":
        await removeNickLock(api, threadID);
        break;
      case "messageBlockOn":
        await toggleMessageBlock(api, threadID, 'on');
        break;
      case "messageBlockOff":
        await toggleMessageBlock(api, threadID, 'off');
        break;
      default:
        ipcLog(`⚠️ Unknown action received: ${action}`);
    }
  } catch (e) {
    ipcLog(`❌ IPC action ${action} failed: ${e.message}`);
  }
});

// ------------------ LOGIN ------------------
let api; // Make api globally accessible for the IPC handler
login({ appState }, async (err, clientApi) => {
  if (err) {
    console.error("❌ Login failed:", err);
    process.exit(1);
  }
  api = clientApi; // Set the global api
  api.setOptions({ listenEvents: true, selfListen: false });
  ipcLog("🤖 ANURAG BOT ONLINE");

  setInterval(saveLocks, 60000);

  const deletedMsgs = new Map(); // track anti-delete
.listenMqtt(async (err, event) => {
    if (err || !event) return;
    const threadID = String(event.threadID || "");
    const senderID = String(event.senderID || "");

    try {
      // --------- ANTI OUT (Unchanged) ---------
      if (event.type === "event" && event.logMessageType === "log:unsubscribe") {
        const leftUID = event.logMessageData.leftParticipantFbId;
        if (locks.antiOut && leftUID && leftUID !== api.getCurrentUserID()) {
          try {
            await api.addUserToGroup(leftUID, threadID);
            await api.sendMessage(`🚫 Anti-Out Active!\n${leftUID} ko wapas add kar diya 😎`, threadID);
            ipcLog(`🔁 Added back ${leftUID} to ${threadID}`);
          } catch (e) {
            ipcLog("⚠️ Failed to re-add user: " + e.message);
          }
        }
        return;
      }

      // --------- MESSAGE BLOCK (NEW) ---------
      if (event.type === "message" && locks.messageBlock[threadID] && senderID !== BOSS_UID) {
        // Only block messages if lock is ON and sender is NOT the boss
        api.deleteMessage(event.messageID);
        ipcLog(`🚫 Blocked message from ${senderID} in ${threadID}.`);
        return; // Stop further processing for blocked messages
      }

      // --------- ANTI DELETE (Unchanged) ---------
      if (event.type === "message") {
        if (event.body) {
          deletedMsgs.set(event.messageID, {
            senderID,
            body: event.body,
          });
          if (deletedMsgs.size > 300) {
            const firstKey = deletedMsgs.keys().next().value;
            deletedMsgs.delete(firstKey);
          }
        }
        return;
      }

      if (event.type === "message_unsend") {
        const data = deletedMsgs.get(event.messageID);
        if (data) {
          const info = await api.getUserInfo(data.senderID);
          const name = info?.[data.senderID]?.name || "Someone";
          await api.sendMessage(
            `👀 ${name} ne ek message delete kiya:\n“${data.body}”`,
            event.threadID
          );
          deletedMsgs.delete(event.messageID);
        } else {
          await api.sendMessage(`👀 Koi message delete hua (content unknown)`, event.threadID);
        }
        return;
      }

      // --------- COMMANDS (Unchanged, but now also using ipcLog) ---------
      if (event.type !== "message" || senderID !== BOSS_UID) return;
      const body = event.body?.trim();
      if (!body) return;

      const parts = body.split(/\s+/);
      const cmd = parts[0].replace(/^\//, "").toLowerCase();
      const args = parts.slice(1);

      // /anurag help
      if (cmd === "anurag") {
        return api.sendMessage(
`👑 *ANURAG BOT COMMANDS* 👑

/groupname on <name> → Lock group name
/groupname off → Unlock name
/nicknames on <nick> → Lock all nicknames
/nicknames off → Unlock all nicknames
/antiout on|off → Toggle anti-out
/blockmsg on|off → Toggle message blocking (NEW)

🔰 Made by Anurag Mishra 💖`,
          threadID
        );
