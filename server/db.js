const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "db.json");

const emptyDb = {
  users: [],
  conversations: [],
  posterJobs: [],
  settings: {
    logoPath: null
  }
};

function ensureDb() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    const passwordHash = bcrypt.hashSync("admin123", 10);
    const now = new Date().toISOString();
    const db = {
      ...emptyDb,
      users: [
        {
          id: crypto.randomUUID(),
          username: "admin",
          passwordHash,
          role: "admin",
          enabled: true,
          createdAt: now
        }
      ]
    };
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

module.exports = {
  readDb,
  writeDb,
  publicUser
};
