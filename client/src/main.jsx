import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  Download,
  ImagePlus,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plus,
  Send,
  Settings,
  Shield,
  Trash2,
  Upload,
  Users
} from "lucide-react";
import "./styles.css";

const API = "/api";

function request(path, options = {}) {
  const token = localStorage.getItem("token");
  const headers = options.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`${API}${path}`, { ...options, headers: { ...headers, ...options.headers } }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "请求失败");
    return data;
  });
}

function absoluteUrl(path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${window.location.origin}${path}`;
}

function Login({ onLogin }) {
  const [form, setForm] = useState({ username: "admin", password: "admin123" });
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify(form)
      });
      localStorage.setItem("token", data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={submit}>
        <div className="brand-mark">勤</div>
        <h1>勤海报</h1>
        <p>企业内部 AI 对话与海报生成平台</p>
        <label>
          用户名
          <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </label>
        <label>
          密码
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit">登录</button>
      </form>
    </main>
  );
}

function Shell({ user, setUser }) {
  const [view, setView] = useState("chat");
  const nav = [
    ["chat", MessageSquare, "对话"],
    ["poster", ImagePlus, "海报生成"],
    ["history", LayoutDashboard, "海报历史"]
  ];
  if (user.role === "admin") nav.push(["admin", Shield, "管理后台"]);

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo-row"><div className="brand-mark small">勤</div><strong>勤海报</strong></div>
        <nav>
          {nav.map(([key, Icon, label]) => (
            <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <strong>{view === "chat" ? "AI 对话" : view === "poster" ? "海报生成" : view === "history" ? "海报历史" : "管理后台"}</strong>
            <span>{user.role === "admin" ? "管理员" : "普通员工"} · {user.username}</span>
          </div>
          <button className="ghost" onClick={logout}><LogOut size={17} />退出</button>
        </header>
        {view === "chat" && <ChatView />}
        {view === "poster" && <PosterView />}
        {view === "history" && <PosterHistory />}
        {view === "admin" && <AdminView />}
      </section>
    </div>
  );
}

function ChatView() {
  const [conversations, setConversations] = useState([]);
  const [current, setCurrent] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { loadConversations(); }, []);

  async function loadConversations() {
    const data = await request("/conversations");
    setConversations(data.conversations);
    if (!current && data.conversations[0]) openConversation(data.conversations[0].id);
  }

  async function openConversation(id) {
    const data = await request(`/conversations/${id}`);
    setCurrent(data.conversation);
  }

  async function newChat() {
    const data = await request("/conversations", { method: "POST", body: JSON.stringify({ title: "新对话" }) });
    setCurrent(data.conversation);
    loadConversations();
  }

  async function removeChat(id) {
    await request(`/conversations/${id}`, { method: "DELETE" });
    setCurrent(null);
    loadConversations();
  }

  async function send() {
    if (!input.trim() || loading) return;
    const content = input.trim();
    setInput("");
    setError("");
    setLoading(true);
    const optimistic = current || { id: null, title: content.slice(0, 24), messages: [] };
    setCurrent({ ...optimistic, messages: [...optimistic.messages, { role: "user", content }] });
    try {
      const data = await request("/chat", {
        method: "POST",
        body: JSON.stringify({ conversationId: current?.id, content })
      });
      setCurrent(data.conversation);
      loadConversations();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-layout">
      <aside className="conversation-list">
        <button className="primary full" onClick={newChat}><Plus size={17} />新建对话</button>
        {conversations.map((item) => (
          <button key={item.id} className={`conversation ${current?.id === item.id ? "selected" : ""}`} onClick={() => openConversation(item.id)}>
            <span>{item.title}</span>
            <small>{item.messageCount} 条消息</small>
          </button>
        ))}
      </aside>
      <main className="chat-main">
        <div className="messages">
          {!current?.messages?.length && <Empty icon={Bot} title="今天想创作什么？" text="可以写文案、想活动主题，也可以整理成海报生成提示词。" />}
          {current?.messages?.map((msg, index) => (
            <div key={index} className={`message ${msg.role}`}>
              <div>{msg.content}</div>
            </div>
          ))}
          {loading && <div className="message assistant"><div>正在生成...</div></div>}
        </div>
        {error && <div className="error inline">{error}</div>}
        <div className="composer">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }} placeholder="请输入你的需求，例如：帮我写一段新品发布朋友圈文案" />
          <button className="primary icon" onClick={send} disabled={loading}><Send size={18} /></button>
          {current?.id && <button className="ghost icon" onClick={() => removeChat(current.id)}><Trash2 size={18} /></button>}
        </div>
      </main>
    </div>
  );
}

function PosterView() {
  const [prompt, setPrompt] = useState("");
  const [reference, setReference] = useState(null);
  const [useLogo, setUseLogo] = useState(true);
  const [logoStyle, setLogoStyle] = useState("auto");
  const [settings, setSettings] = useState({});
  const [poster, setPoster] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { request("/settings").then(setSettings).catch(() => {}); }, []);

  async function generate() {
    if (!prompt.trim() || loading) return;
    const content = prompt.trim();
    setError("");
    setLoading(true);
    setPrompt("");
    setMessages((items) => [...items, { role: "user", content }]);
    try {
      const form = new FormData();
      form.append("prompt", content);
      form.append("useLogo", String(useLogo));
      form.append("logoStyle", logoStyle);
      if (poster?.id) form.append("priorPosterId", poster.id);
      if (reference) form.append("reference", reference);
      const data = await request("/posters", { method: "POST", body: form });
      setPoster(data.poster);
      setMessages((items) => [...items, {
        role: "assistant",
        content: poster?.id ? "已根据你的调整生成新版本。" : "已生成第一版海报。",
        poster: data.poster
      }]);
      setReference(null);
    } catch (err) {
      setError(err.message);
      setMessages((items) => [...items, { role: "assistant", content: `生成失败：${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  function newPosterChat() {
    setPrompt("");
    setReference(null);
    setPoster(null);
    setMessages([]);
    setError("");
  }

  async function downloadPoster() {
    if (!poster) return;
    await downloadPosterFile(poster);
  }

  return (
    <div className="poster-chat-grid">
      <section className="panel poster-chat-panel">
        <div className="panel-title-row">
          <h2>海报创作对话</h2>
          <button className="ghost" onClick={newPosterChat} disabled={loading}><Plus size={17} />新建创作</button>
        </div>
        <div className="poster-thread">
          {!messages.length && <Empty icon={ImagePlus} title="描述你的第一版海报" text="生成后可以继续说“换成蓝色科技风”“标题放大”“再来一版更简洁的”。" />}
          {messages.map((msg, index) => (
            <div key={index} className={`poster-chat-message ${msg.role}`}>
              <div>
                <p>{msg.content}</p>
                {msg.poster && <PosterCard poster={msg.poster} onDownload={() => downloadPosterFile(msg.poster)} />}
              </div>
            </div>
          ))}
          {loading && <div className="poster-chat-message assistant"><div><p>正在生成新版本...</p></div></div>}
        </div>
        {error && <div className="error inline">{error}</div>}
        <div className="poster-controls">
          <label className="upload-box compact">
            <Upload size={18} />
            <span>{reference ? reference.name : "参考图"}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setReference(e.target.files?.[0] || null)} />
          </label>
          <label className="check-row compact-check">
            <input type="checkbox" checked={useLogo} onChange={(e) => setUseLogo(e.target.checked)} />
            Logo 融合
          </label>
          <select className="logo-style-select" value={logoStyle} onChange={(e) => setLogoStyle(e.target.value)} disabled={!useLogo}>
            <option value="auto">自动融合</option>
            <option value="white">简洁白底</option>
            <option value="glass">玻璃悬浮</option>
            <option value="dark">深色柔光</option>
          </select>
        </div>
        {!settings.logoUrl && useLogo && <div className="notice">当前还没有企业 Logo，管理员可在后台上传。</div>}
        <div className="poster-composer">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              generate();
            }
          }} placeholder={poster ? "继续调整这张海报，例如：换成深蓝色、标题更大、画面更简洁" : "请描述你想要的海报，例如：生成一张端午节企业福利海报，国风、清爽、标题是“端午安康，福利已到”"} />
          <button className="primary icon" onClick={generate} disabled={loading || !prompt.trim()}><Send size={18} /></button>
        </div>
      </section>
      <section className="panel result-panel">
        <h2>当前版本</h2>
        {!poster && <Empty icon={ImagePlus} title="还没有海报" text="在左侧输入描述，生成结果会自动保存到海报历史。" />}
        {poster && <PosterCard poster={poster} onDownload={downloadPoster} large />}
      </section>
    </div>
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function downloadPosterFile(poster) {
  const image = await loadImage(absoluteUrl(poster.imageUrl));
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);

  if (poster.logoUrl) {
    const logo = await loadImage(absoluteUrl(poster.logoUrl));
    const style = resolveCanvasLogoStyle(poster.logoStyle || "auto", ctx, canvas);
    const width = Math.round(canvas.width * 0.18);
    const height = Math.round((logo.naturalHeight / logo.naturalWidth) * width);
    const padding = Math.round(canvas.width * 0.04);
    const framePad = Math.round(canvas.width * 0.018);
    const radius = Math.round(canvas.width * 0.018);
    const frame = {
      x: padding - framePad,
      y: padding - framePad,
      width: width + framePad * 2,
      height: height + framePad * 2
    };

    drawLogoFrame(ctx, frame, radius, style);
    ctx.drawImage(logo, padding, padding, width, height);
  }

  const link = document.createElement("a");
  link.download = `勤海报-${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function resolveCanvasLogoStyle(style, ctx, canvas) {
  if (style !== "auto") return style;

  const sampleX = Math.round(canvas.width * 0.03);
  const sampleY = Math.round(canvas.height * 0.03);
  const sampleW = Math.round(canvas.width * 0.26);
  const sampleH = Math.round(canvas.height * 0.14);
  let data;
  try {
    data = ctx.getImageData(sampleX, sampleY, sampleW, sampleH).data;
  } catch (error) {
    return "glass";
  }
  let total = 0;
  let totalSquare = 0;
  let count = 0;

  for (let index = 0; index < data.length; index += 16) {
    const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    total += luminance;
    totalSquare += luminance * luminance;
    count += 1;
  }

  const average = total / count;
  const variance = Math.max(0, totalSquare / count - average * average);
  const contrast = Math.sqrt(variance);

  if (average < 95) return "dark";
  if (contrast > 38) return "glass";
  return "white";
}

function drawLogoFrame(ctx, frame, radius, style) {
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
  ctx.shadowBlur = Math.max(10, frame.width * 0.08);
  ctx.shadowOffsetY = Math.max(3, frame.width * 0.02);

  if (style === "dark") {
    ctx.fillStyle = "rgba(13, 28, 43, 0.62)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  } else if (style === "glass") {
    ctx.fillStyle = "rgba(255, 255, 255, 0.58)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
  } else {
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeStyle = "rgba(23, 32, 42, 0.08)";
  }

  roundedRect(ctx, frame.x, frame.y, frame.width, frame.height, radius);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = Math.max(1, frame.width * 0.006);
  ctx.stroke();
  ctx.restore();
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function PosterHistory() {
  const [posters, setPosters] = useState([]);
  const [keyword, setKeyword] = useState("");

  useEffect(() => { request("/posters").then((data) => setPosters(data.posters)); }, []);

  const filtered = posters.filter((item) => item.prompt.includes(keyword) || item.username.includes(keyword));

  return (
    <div className="history-page">
      <div className="toolbar">
        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索描述或用户" />
      </div>
      <div className="poster-list">
        {filtered.map((poster) => <PosterCard key={poster.id} poster={poster} />)}
      </div>
      {!filtered.length && <Empty icon={LayoutDashboard} title="暂无记录" text="生成过的海报会出现在这里。" />}
    </div>
  );
}

function PosterCard({ poster, onDownload, large = false }) {
  return (
    <article className={`poster-card ${large ? "large" : ""}`}>
      <div className="poster-preview">
        <img src={poster.imageUrl} alt="生成海报" />
        {poster.logoUrl && <PosterLogoOverlay poster={poster} />}
      </div>
      <div className="poster-info">
        <strong>{poster.prompt}</strong>
        <span>{poster.username} · {new Date(poster.createdAt).toLocaleString()}</span>
        <div className="actions">
          {onDownload ? (
            <button className="primary" onClick={onDownload}><Download size={17} />下载图片</button>
          ) : (
            <button className="button-link" onClick={() => downloadPosterFile(poster)}><Download size={17} />下载图片</button>
          )}
        </div>
      </div>
    </article>
  );
}

function PosterLogoOverlay({ poster }) {
  const style = poster.logoStyle || "auto";
  return (
    <div className={`poster-logo-frame poster-logo-${style}`}>
      <img className="poster-logo" src={poster.logoUrl} alt="企业 Logo" />
    </div>
  );
}

function AdminView() {
  const [tab, setTab] = useState("users");
  return (
    <div className="admin-layout">
      <aside className="admin-tabs">
        <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Users size={17} />用户管理</button>
        <button className={tab === "logo" ? "active" : ""} onClick={() => setTab("logo")}><Settings size={17} />Logo 管理</button>
        <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}><LayoutDashboard size={17} />使用统计</button>
        <button className={tab === "records" ? "active" : ""} onClick={() => setTab("records")}><MessageSquare size={17} />记录查看</button>
      </aside>
      <main className="panel">
        {tab === "users" && <UserAdmin />}
        {tab === "logo" && <LogoAdmin />}
        {tab === "stats" && <StatsAdmin />}
        {tab === "records" && <RecordsAdmin />}
      </main>
    </div>
  );
}

function UserAdmin() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", role: "user" });
  const [error, setError] = useState("");
  const load = () => request("/admin/users").then((data) => setUsers(data.users));
  useEffect(() => { load(); }, []);

  async function createUser(e) {
    e.preventDefault();
    setError("");
    try {
      await request("/admin/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ username: "", password: "", role: "user" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateUser(id, patch) {
    await request(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    load();
  }

  return (
    <>
      <h2>用户管理</h2>
      <form className="inline-form" onSubmit={createUser}>
        <input placeholder="用户名" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input placeholder="初始密码" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="user">普通员工</option>
          <option value="admin">管理员</option>
        </select>
        <button className="primary">新增用户</button>
      </form>
      {error && <div className="error inline">{error}</div>}
      <table>
        <thead><tr><th>用户名</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.username}</td>
              <td>{user.role === "admin" ? "管理员" : "普通员工"}</td>
              <td>{user.enabled ? "启用" : "禁用"}</td>
              <td><button className="ghost" onClick={() => updateUser(user.id, { enabled: !user.enabled })}>{user.enabled ? "禁用" : "启用"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function LogoAdmin() {
  const [logoUrl, setLogoUrl] = useState("");
  const [file, setFile] = useState(null);
  useEffect(() => { request("/settings").then((data) => setLogoUrl(data.logoUrl)); }, []);

  async function uploadLogo() {
    const form = new FormData();
    form.append("logo", file);
    const data = await request("/admin/logo", { method: "POST", body: form });
    setLogoUrl(data.logoUrl);
    setFile(null);
  }

  return (
    <>
      <h2>Logo 管理</h2>
      <label className="upload-box">
        <Upload size={20} />
        <span>{file ? file.name : "选择企业 Logo"}</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      <button className="primary" onClick={uploadLogo} disabled={!file}>上传 Logo</button>
      {logoUrl && <div className="logo-preview"><img src={logoUrl} alt="企业 Logo" /></div>}
    </>
  );
}

function StatsAdmin() {
  const [stats, setStats] = useState(null);
  useEffect(() => { request("/admin/stats").then(setStats); }, []);
  if (!stats) return null;
  return (
    <>
      <h2>使用统计</h2>
      <div className="stats-grid">
        <Stat label="用户总数" value={stats.totalUsers} />
        <Stat label="会话总数" value={stats.totalConversations} />
        <Stat label="海报总数" value={stats.totalPosters} />
        <Stat label="今日海报" value={stats.todayPosters} />
        <Stat label="今日消息" value={stats.todayMessages} />
      </div>
    </>
  );
}

function RecordsAdmin() {
  const [conversations, setConversations] = useState([]);
  const [posters, setPosters] = useState([]);
  useEffect(() => {
    request("/conversations?full=1").then((data) => setConversations(data.conversations));
    request("/posters").then((data) => setPosters(data.posters));
  }, []);
  return (
    <>
      <h2>记录查看</h2>
      <h3>聊天记录</h3>
      <div className="record-list">
        {conversations.map((item) => <div className="record" key={item.id}><strong>{item.title}</strong><span>{item.username} · {item.messages?.length || 0} 条</span></div>)}
      </div>
      <h3>海报记录</h3>
      <div className="poster-list compact">
        {posters.map((poster) => <PosterCard key={poster.id} poster={poster} />)}
      </div>
    </>
  );
}

function Stat({ label, value }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

function Empty({ icon: Icon, title, text }) {
  return <div className="empty"><Icon size={34} /><strong>{title}</strong><span>{text}</span></div>;
}

function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    request("/auth/me").then((data) => setUser(data.user)).catch(() => localStorage.removeItem("token")).finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="boot">勤海报加载中...</div>;
  return user ? <Shell user={user} setUser={setUser} /> : <Login onLogin={setUser} />;
}

createRoot(document.getElementById("root")).render(<App />);
