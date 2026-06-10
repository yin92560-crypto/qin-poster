# 勤海报

企业内部 AI 对话与海报生成平台。前端使用 React + Vite，后端使用 Express；部署到 Vercel 后，数据保存到 Supabase Postgres，图片保存到 Cloudflare R2。

Production deployment target: Vercel.

## 本地运行

```powershell
copy .env.example .env
npm.cmd install
npm.cmd run build
npm.cmd start
```

打开：`http://127.0.0.1:8787`

默认管理员账号：

- 用户名：`admin`
- 密码：`admin123`

首次连接 Supabase 时，后端会自动创建数据表和默认管理员账号。

## 必填环境变量

Vercel Project Settings -> Environment Variables 中需要填写：

```env
JWT_SECRET=

DATABASE_URL=
DATABASE_SSL=true

CHAT_BASE_URL=https://api.deepseek.com
CHAT_API_KEY=
CHAT_MODEL=deepseek-v4-pro

IMAGE_BASE_URL=https://api.weelinking.com/v1
IMAGE_GENERATIONS_URL=https://api.weelinking.com/v1/images/generations
IMAGE_API_KEY=
IMAGE_MODEL=gpt-image-2
IMAGE_SIZE=1024x1024

R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_URL=
```

## Supabase

创建 Supabase 项目后，在 Project Settings -> Database 中复制 Postgres connection string，填到 `DATABASE_URL`。

本项目会自动创建这些表：

- `users`
- `conversations`
- `poster_jobs`
- `settings`

## Cloudflare R2

需要创建：

- 一个 R2 bucket
- 一个 R2 API token/access key
- 一个公开访问域名，填入 `R2_PUBLIC_URL`

`R2_PUBLIC_URL` 必须能被浏览器直接访问，否则历史海报和 Logo 无法显示。

## Vercel

把 GitHub 仓库导入 Vercel 后，填写上面的环境变量即可部署。项目包含 `vercel.json`，会把：

- `/api/*` 转发给 Express API
- 其他路径交给前端单页应用

## 安全提醒

不要提交真实 `.env` 文件。仓库只提交 `.env.example`，真实 API Key 应该只放在本地或 Vercel 环境变量里。
