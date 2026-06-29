const crypto = require("crypto");
const path = require("path");
const { DeleteObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");

let client;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`还没有配置 ${name}，请在 Vercel 环境变量中填写 R2 配置。`);
  return value;
}

function getClient() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: required("R2_ENDPOINT"),
      credentials: {
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY")
      }
    });
  }

  return client;
}

function publicUrl(key) {
  const base = required("R2_PUBLIC_URL").replace(/\/$/, "");
  return `${base}/${key}`;
}

function extensionFromName(fileName, fallback = ".png") {
  const ext = path.extname(fileName || "").toLowerCase();
  return ext || fallback;
}

async function uploadBuffer(folder, buffer, contentType, originalName) {
  const ext = extensionFromName(originalName);
  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}${ext}`;

  await getClient().send(new PutObjectCommand({
    Bucket: required("R2_BUCKET"),
    Key: key,
    Body: buffer,
    ContentType: contentType || "application/octet-stream"
  }));

  return publicUrl(key);
}

function keyFromPublicUrl(url) {
  if (!url) return null;
  const base = required("R2_PUBLIC_URL").replace(/\/$/, "");
  if (!url.startsWith(`${base}/`)) return null;
  return decodeURIComponent(url.slice(base.length + 1));
}

async function deleteObjectByUrl(url) {
  const key = keyFromPublicUrl(url);
  if (!key) return;

  await getClient().send(new DeleteObjectCommand({
    Bucket: required("R2_BUCKET"),
    Key: key
  }));
}

module.exports = {
  deleteObjectByUrl,
  uploadBuffer
};
