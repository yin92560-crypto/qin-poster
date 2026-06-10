const jwt = require("jsonwebtoken");
const { readDb, publicUser } = require("./db");

function signUser(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET || "dev-secret",
    { expiresIn: "7d" }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "请先登录" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    const db = readDb();
    const user = db.users.find((item) => item.id === payload.id && item.enabled);
    if (!user) return res.status(401).json({ message: "账号不存在或已禁用" });
    req.user = publicUser(user);
    next();
  } catch (error) {
    res.status(401).json({ message: "登录状态已失效，请重新登录" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "需要管理员权限" });
  }
  next();
}

module.exports = {
  signUser,
  requireAuth,
  requireAdmin
};
