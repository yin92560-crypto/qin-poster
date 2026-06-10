require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");

const { readDb, writeDb, publicUser } = require("./db");
const { signUser, requireAuth, requireAdmin } = require("./auth");
const { chat, generateImage } = require("./openai");

const app = express();
const port = Number(process.env.PORT || 8787);
const rootDir = path.join(__dirname, "..");
const uploadDir = path.join(__dirname, "uploads");

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const folder = file.fieldname === "logo" ? "logos" : "refs";
    const target = path.join(uploadDir, folder);
    fs.mkdirSync(target, { recursive: true });
    cb(null, target);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || "") || ".png";
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
      return cb(new Error("只支持 PNG、JPG、WEBP 图片"));
    }
    cb(null, true);
  }
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadDir));

function asUrl(filePath) {
  if (!filePath) return null;
  return `/uploads/${path.relative(uploadDir, filePath).replaceAll("\\", "/")}`;
}

function canReadRecord(user, record) {
  return user.role === "admin" || record.userId === user.id;
}

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const db = readDb();
  const user = db.users.find((item) => item.username === username);
  if (!user || !user.enabled) return res.status(401).json({ message: "账号不存在或已禁用" });

  const ok = await bcrypt.compare(password || "", user.passwordHash);
  if (!ok) return res.status(401).json({ message: "用户名或密码错误" });

  res.json({ token: signUser(user), user: publicUser(user) });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/conversations", requireAuth, (req, res) => {
  const db = readDb();
  const conversations = db.conversations
    .filter((item) => canReadRecord(req.user, item))
    .map((item) => ({
      ...item,
      messages: req.query.full === "1" ? item.messages : undefined,
      messageCount: item.messages.length
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json({ conversations });
});

app.get("/api/conversations/:id", requireAuth, (req, res) => {
  const db = readDb();
  const item = db.conversations.find((conversation) => conversation.id === req.params.id);
  if (!item || !canReadRecord(req.user, item)) return res.status(404).json({ message: "会话不存在" });
  res.json({ conversation: item });
});

app.post("/api/conversations", requireAuth, (req, res) => {
  const db = readDb();
  const now = new Date().toISOString();
  const conversation = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    username: req.user.username,
    title: req.body.title || "新对话",
    messages: [],
    createdAt: now,
    updatedAt: now
  };
  db.conversations.push(conversation);
  writeDb(db);
  res.json({ conversation });
});

app.delete("/api/conversations/:id", requireAuth, (req, res) => {
  const db = readDb();
  const item = db.conversations.find((conversation) => conversation.id === req.params.id);
  if (!item || !canReadRecord(req.user, item)) return res.status(404).json({ message: "会话不存在" });
  db.conversations = db.conversations.filter((conversation) => conversation.id !== req.params.id);
  writeDb(db);
  res.json({ ok: true });
});

app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    const { conversationId, content } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: "请输入内容" });

    const db = readDb();
    let conversation = db.conversations.find((item) => item.id === conversationId);
    const now = new Date().toISOString();

    if (!conversation) {
      conversation = {
        id: crypto.randomUUID(),
        userId: req.user.id,
        username: req.user.username,
        title: content.slice(0, 24),
        messages: [],
        createdAt: now,
        updatedAt: now
      };
      db.conversations.push(conversation);
    }

    if (!canReadRecord(req.user, conversation)) return res.status(403).json({ message: "无权操作该会话" });

    conversation.messages.push({ role: "user", content, createdAt: now });
    const system = {
      role: "system",
      content: "你是勤海报，企业内部 AI 创作助手。请用中文回答，擅长写文案、活动创意和海报生成提示词。"
    };
    const reply = await chat([system, ...conversation.messages.map(({ role, content: text }) => ({ role, content: text }))]);
    conversation.messages.push({ role: "assistant", content: reply, createdAt: new Date().toISOString() });
    conversation.updatedAt = new Date().toISOString();
    writeDb(db);
    res.json({ conversation, reply });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/posters", requireAuth, upload.single("reference"), async (req, res) => {
  try {
    const { prompt, useLogo } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ message: "请输入海报描述" });

    const db = readDb();
    const logoUrl = useLogo === "true" ? asUrl(db.settings.logoPath) : null;
    const referenceText = "";

    const finalPrompt = [
      "生成一张中文企业海报，画面清晰、构图完整、适合企业内部传播。",
      "海报文字要尽量准确、简洁，避免乱码。",
      prompt,
      req.file ? "用户上传了参考图片，当前版本仅保存参考图，不调用对话模型识图分析。" : "",
      logoUrl ? "用户选择添加企业 Logo，前端会默认放在右上角，请预留干净位置。" : ""
    ].filter(Boolean).join("\n");

    const image = await generateImage(finalPrompt);
    const posterDir = path.join(uploadDir, "posters");
    fs.mkdirSync(posterDir, { recursive: true });
    const posterPath = path.join(posterDir, `${Date.now()}-${crypto.randomUUID()}.png`);
    fs.writeFileSync(posterPath, image);

    const now = new Date().toISOString();
    const poster = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      username: req.user.username,
      prompt,
      finalPrompt,
      referenceUrl: req.file ? asUrl(req.file.path) : null,
      referenceText,
      useLogo: useLogo === "true",
      logoUrl,
      imageUrl: asUrl(posterPath),
      createdAt: now
    };
    db.posterJobs.push(poster);
    writeDb(db);
    res.json({ poster });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/posters", requireAuth, (req, res) => {
  const db = readDb();
  const posters = db.posterJobs
    .filter((item) => canReadRecord(req.user, item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ posters });
});

app.get("/api/settings", requireAuth, (req, res) => {
  const db = readDb();
  res.json({ logoUrl: asUrl(db.settings.logoPath) });
});

app.post("/api/admin/logo", requireAuth, requireAdmin, upload.single("logo"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "请选择 Logo 图片" });
  const db = readDb();
  db.settings.logoPath = req.file.path;
  writeDb(db);
  res.json({ logoUrl: asUrl(req.file.path) });
});

app.get("/api/admin/users", requireAuth, requireAdmin, (req, res) => {
  const db = readDb();
  res.json({ users: db.users.map(publicUser) });
});

app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ message: "用户名和密码不能为空" });

  const db = readDb();
  if (db.users.some((user) => user.username === username)) {
    return res.status(400).json({ message: "用户名已存在" });
  }

  const user = {
    id: crypto.randomUUID(),
    username,
    passwordHash: await bcrypt.hash(password, 10),
    role: role === "admin" ? "admin" : "user",
    enabled: true,
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  writeDb(db);
  res.json({ user: publicUser(user) });
});

app.patch("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const db = readDb();
  const user = db.users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ message: "用户不存在" });

  if (typeof req.body.enabled === "boolean") user.enabled = req.body.enabled;
  if (req.body.role) user.role = req.body.role === "admin" ? "admin" : "user";
  if (req.body.password) user.passwordHash = await bcrypt.hash(req.body.password, 10);
  writeDb(db);
  res.json({ user: publicUser(user) });
});

app.get("/api/admin/stats", requireAuth, requireAdmin, (req, res) => {
  const db = readDb();
  const today = new Date().toISOString().slice(0, 10);
  const todayPosters = db.posterJobs.filter((item) => item.createdAt.startsWith(today)).length;
  const todayMessages = db.conversations.flatMap((item) => item.messages).filter((item) => item.createdAt?.startsWith(today)).length;
  res.json({
    totalUsers: db.users.length,
    totalConversations: db.conversations.length,
    totalPosters: db.posterJobs.length,
    todayPosters,
    todayMessages
  });
});

if (fs.existsSync(path.join(rootDir, "dist"))) {
  app.use(express.static(path.join(rootDir, "dist")));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    res.sendFile(path.join(rootDir, "dist", "index.html"));
  });
}

app.listen(port, () => {
  console.log(`勤海报后端已启动：http://127.0.0.1:${port}`);
});
