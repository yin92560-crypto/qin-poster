function providerConfig(kind) {
  if (kind === "image") {
    return {
      baseUrl: process.env.IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      generationsUrl: process.env.IMAGE_GENERATIONS_URL,
      apiKey: process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY,
      model: process.env.IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || "gpt-image-1"
    };
  }

  return {
    baseUrl: process.env.CHAT_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.CHAT_API_KEY || process.env.OPENAI_API_KEY,
    model: process.env.CHAT_MODEL || process.env.OPENAI_CHAT_MODEL || "deepseek-chat"
  };
}

async function callCompatibleApi(kind, path, body) {
  const config = providerConfig(kind);

  if (!config.apiKey) {
    const name = kind === "image" ? "IMAGE_API_KEY" : "CHAT_API_KEY";
    throw new Error(`还没有配置 ${name}，请先在 .env 中填写对应 API Key。`);
  }

  const url = kind === "image" && config.generationsUrl
    ? config.generationsUrl
    : `${config.baseUrl.replace(/\/$/, "")}${path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `${kind} API 调用失败`;
    throw new Error(message);
  }

  return data;
}

async function chat(messages) {
  const config = providerConfig("chat");
  const data = await callCompatibleApi("chat", "/chat/completions", {
    model: config.model,
    messages,
    temperature: 0.7
  });

  return data.choices?.[0]?.message?.content || "";
}

async function describeImage(imageBuffer, mimeType) {
  const config = providerConfig("chat");
  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  const data = await callCompatibleApi("chat", "/chat/completions", {
    model: process.env.VISION_MODEL || config.model,
    messages: [
      {
        role: "system",
        content: "你是企业海报设计助手。请用中文简洁描述图片中的主体、风格、色彩和可用于海报设计的元素。"
      },
      {
        role: "user",
        content: [
          { type: "text", text: "请分析这张参考图，输出适合生成海报的设计参考描述。" },
          { type: "image_url", image_url: { url: dataUrl } }
        ]
      }
    ],
    temperature: 0.3
  });

  return data.choices?.[0]?.message?.content || "";
}

async function generateImage(prompt) {
  const config = providerConfig("image");
  const data = await callCompatibleApi("image", "/images/generations", {
    model: config.model,
    prompt,
    size: process.env.IMAGE_SIZE || "1024x1024"
  });
  const first = data.data?.[0];

  if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
  if (first?.url) {
    const imageResponse = await fetch(first.url);
    if (!imageResponse.ok) throw new Error("图片下载失败");
    return Buffer.from(await imageResponse.arrayBuffer());
  }

  throw new Error("图片接口没有返回可用图片");
}

module.exports = {
  chat,
  describeImage,
  generateImage
};
