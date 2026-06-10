# 勤海报

企业内部 AI 对话与海报生成 MVP。

## 运行

```powershell
copy .env.example .env
npm.cmd install
npm.cmd run dev
```

打开前端地址：`http://127.0.0.1:5173`

默认账号：

- 管理员：`admin` / `admin123`

## API 配置

把对话和生图服务商提供的地址、Key、模型名填到 `.env`：

```env
CHAT_BASE_URL=https://对话接口地址/v1
CHAT_API_KEY=你的对话key
CHAT_MODEL=deepseek-chat

IMAGE_BASE_URL=https://生图接口地址/v1
IMAGE_API_KEY=你的生图key
IMAGE_MODEL=gpt-image-2
```

如果暂时没有 Key，系统仍可登录和使用管理功能，但 AI 调用会返回配置提示。

注意：如果对话模型不支持识别上传图片，参考图分析会失败。可以后续单独配置一个支持视觉理解的 `VISION_MODEL`。
