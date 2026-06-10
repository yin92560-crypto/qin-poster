require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");

const { ensureSchema, publicUser, query, toCamel } = require("./db");
const { signUser, requireAuth, requireAdmin } = require("./auth");
const { chat, generateImage } = require("./openai");
const { uploadBuffer } = require("./storage");

const app = express();
const rootDir = path.join(__dirname, "..");

const upload = multer({
  storage: multer.memoryStorage(),
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

function canReadRecord(user, record) {
  return user.role === "admin" || record.userId === user.id;
}

function mapConversation(row, includeMessages = true) {
  const item = toCamel(row);
  const messages = Array.isArray(item.messages) ? item.messages : [];
  return {
    ...item,
    messages: includeMessages ? messages : undefined,
    messageCount: messages.length
  };
}

function mapPoster(row) {
  return toCamel(row);
}

app.get("/api/health", async (req, res) => {
  await ensureSchema();
  res.json({ ok: true });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await query("select * from users where username = $1 limit 1", [username]);
    const user = toCamel(result.rows[0]);
    if (!user || !user.enabled) return res.status(401).json({ message: "账号不存在或已禁用" });

    const ok = await bcrypt.compare(password || "", user.passwordHash);
    if (!ok) return res.status(401).json({ message: "用户名或密码错误" });

    res.json({ token: signUser(user), user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/conversations", requireAuth, async (req, res) => {
  const includeAll = req.user.role === "admin";
  const includeMessages = req.query.full === "1";
  const result = includeAll
    ? await query("select * from conversations order by updated_at desc")
    : await query("select * from conversations where user_id = $1 order by updated_at desc", [req.user.id]);

  res.json({ conversations: result.rows.map((row) => mapConversation(row, includeMessages)) });
});

app.get("/api/conversations/:id", requireAuth, async (req, res) => {
  const result = await query("select * from conversations where id = $1 limit 1", [req.params.id]);
  const conversation = mapConversation(result.rows[0]);
  if (!conversation || !canReadRecord(req.user, conversation)) {
    return res.status(404).json({ message: "会话不存在" });
  }

  res.json({ conversation });
});

app.post("/api/conversations", requireAuth, async (req, res) => {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const title = req.body.title || "新对话";
  const result = await query(
    `insert into conversations (id, user_id, username, title, messages, created_at, updated_at)
     values ($1, $2, $3, $4, '[]'::jsonb, $5, $5)
     returning *`,
    [id, req.user.id, req.user.username, title, now]
  );

  res.json({ conversation: mapConversation(result.rows[0]) });
});

app.delete("/api/conversations/:id", requireAuth, async (req, res) => {
  const found = await query("select * from conversations where id = $1 limit 1", [req.params.id]);
  const conversation = mapConversation(found.rows[0]);
  if (!conversation || !canReadRecord(req.user, conversation)) {
    return res.status(404).json({ message: "会话不存在" });
  }

  await query("delete from conversations where id = $1", [req.params.id]);
  res.json({ ok: true });
});

app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    const { conversationId, content } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: "请输入内容" });

    const now = new Date().toISOString();
    let conversation;

    if (conversationId) {
      const result = await query("select * from conversations where id = $1 limit 1", [conversationId]);
      conversation = mapConversation(result.rows[0]);
      if (!conversation || !canReadRecord(req.user, conversation)) {
        return res.status(403).json({ message: "无权操作该会话" });
      }
    } else {
      const result = await query(
        `insert into conversations (id, user_id, username, title, messages, created_at, updated_at)
         values ($1, $2, $3, $4, '[]'::jsonb, $5, $5)
         returning *`,
        [crypto.randomUUID(), req.user.id, req.user.username, content.slice(0, 24), now]
      );
      conversation = mapConversation(result.rows[0]);
    }

    const userMessage = { role: "user", content, createdAt: now };
    const messages = [...conversation.messages, userMessage];
    const system = {
      role: "system",
      content: "你是勤海报，企业内部 AI 创作助手。请用中文回答，擅长写文案、活动创意和海报生成提示词。"
    };
    const reply = await chat([system, ...messages.map(({ role, content: text }) => ({ role, content: text }))]);
    const finalMessages = [...messages, { role: "assistant", content: reply, createdAt: new Date().toISOString() }];

    const updated = await query(
      "update conversations set messages = $1::jsonb, updated_at = now() where id = $2 returning *",
      [JSON.stringify(finalMessages), conversation.id]
    );

    res.json({ conversation: mapConversation(updated.rows[0]), reply });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/posters", requireAuth, upload.single("reference"), async (req, res) => {
  try {
    const { prompt, useLogo } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ message: "请输入海报描述" });

    const setting = await query("select value from settings where key = 'logo_url' limit 1");
    const logoUrl = useLogo === "true" ? setting.rows[0]?.value || null : null;
    const referenceUrl = req.file
      ? await uploadBuffer("refs", req.file.buffer, req.file.mimetype, req.file.originalname)
      : null;

    const finalPrompt = [
      "生成一张中文企业海报，画面清晰、构图完整、适合企业内部传播。",
      "海报文字要尽量准确、简洁，避免乱码。",
      prompt,
      referenceUrl ? "用户上传了参考图片，当前版本仅保存参考图，不调用对话模型识图分析。" : "",
      logoUrl ? "用户选择添加企业 Logo，前端会默认放在右上角，请预留干净位置。" : ""
    ].filter(Boolean).join("\n");

    const image = await generateImage(finalPrompt);
    const imageUrl = await uploadBuffer("posters", image, "image/png", "poster.png");
    const now = new Date().toISOString();

    const result = await query(
      `insert into poster_jobs (
        id, user_id, username, prompt, final_prompt, reference_url, reference_text,
        use_logo, logo_url, image_url, created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      returning *`,
      [
        crypto.randomUUID(),
        req.user.id,
        req.user.username,
        prompt,
        finalPrompt,
        referenceUrl,
        "",
        useLogo === "true",
        logoUrl,
        imageUrl,
        now
      ]
    );

    res.json({ poster: mapPoster(result.rows[0]) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/posters", requireAuth, async (req, res) => {
  const result = req.user.role === "admin"
    ? await query("select * from poster_jobs order by created_at desc")
    : await query("select * from poster_jobs where user_id = $1 order by created_at desc", [req.user.id]);

  res.json({ posters: result.rows.map(mapPoster) });
});

app.get("/api/settings", requireAuth, async (req, res) => {
  const result = await query("select value from settings where key = 'logo_url' limit 1");
  res.json({ logoUrl: result.rows[0]?.value || null });
});

app.post("/api/admin/logo", requireAuth, requireAdmin, upload.single("logo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "请选择 Logo 图片" });

  const logoUrl = await uploadBuffer("logos", req.file.buffer, req.file.mimetype, req.file.originalname);
  await query(
    `insert into settings (key, value)
     values ('logo_url', $1)
     on conflict (key) do update set value = excluded.value`,
    [logoUrl]
  );
  res.json({ logoUrl });
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  const result = await query("select * from users order by created_at desc");
  res.json({ users: result.rows.map((row) => publicUser(toCamel(row))) });
});

app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ message: "用户名和密码不能为空" });

    const result = await query(
      `insert into users (id, username, password_hash, role, enabled, created_at)
       values ($1, $2, $3, $4, true, now())
       returning *`,
      [crypto.randomUUID(), username, await bcrypt.hash(password, 10), role === "admin" ? "admin" : "user"]
    );
    res.json({ user: publicUser(toCamel(result.rows[0])) });
  } catch (error) {
    if (error.code === "23505") return res.status(400).json({ message: "用户名已存在" });
    res.status(500).json({ message: error.message });
  }
});

app.patch("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const found = await query("select * from users where id = $1 limit 1", [req.params.id]);
  if (!found.rowCount) return res.status(404).json({ message: "用户不存在" });

  const current = toCamel(found.rows[0]);
  const enabled = typeof req.body.enabled === "boolean" ? req.body.enabled : current.enabled;
  const role = req.body.role ? (req.body.role === "admin" ? "admin" : "user") : current.role;
  const passwordHash = req.body.password ? await bcrypt.hash(req.body.password, 10) : current.passwordHash;

  const result = await query(
    "update users set enabled = $1, role = $2, password_hash = $3 where id = $4 returning *",
    [enabled, role, passwordHash, req.params.id]
  );
  res.json({ user: publicUser(toCamel(result.rows[0])) });
});

app.get("/api/admin/stats", requireAuth, requireAdmin, async (req, res) => {
  const result = await query(`
    select
      (select count(*)::int from users) as total_users,
      (select count(*)::int from conversations) as total_conversations,
      (select count(*)::int from poster_jobs) as total_posters,
      (select count(*)::int from poster_jobs where created_at >= current_date) as today_posters,
      (select coalesce(sum(jsonb_array_length(messages)), 0)::int from conversations where updated_at >= current_date) as today_messages
  `);
  const stats = toCamel(result.rows[0]);
  res.json(stats);
});

if (fs.existsSync(path.join(rootDir, "dist"))) {
  app.use(express.static(path.join(rootDir, "dist")));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(rootDir, "dist", "index.html"));
  });
}

module.exports = app;
