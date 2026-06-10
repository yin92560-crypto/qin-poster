const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

let pool;
let schemaReady;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("还没有配置 DATABASE_URL，请在 Vercel/Supabase 环境变量中填写 Supabase Postgres 连接字符串。");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    });
  }

  return pool;
}

async function query(text, params = []) {
  await ensureSchema();
  return getPool().query(text, params);
}

async function rawQuery(text, params = []) {
  return getPool().query(text, params);
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await rawQuery(`
      create table if not exists users (
        id text primary key,
        username text not null unique,
        password_hash text not null,
        role text not null default 'user',
        enabled boolean not null default true,
        created_at timestamptz not null default now()
      );

      create table if not exists conversations (
        id text primary key,
        user_id text not null,
        username text not null,
        title text not null,
        messages jsonb not null default '[]'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists conversations_user_id_updated_at_idx
        on conversations (user_id, updated_at desc);

      create table if not exists poster_jobs (
        id text primary key,
        user_id text not null,
        username text not null,
        prompt text not null,
        final_prompt text not null,
        reference_url text,
        reference_text text,
        use_logo boolean not null default false,
        logo_url text,
        image_url text not null,
        created_at timestamptz not null default now()
      );

      create index if not exists poster_jobs_user_id_created_at_idx
        on poster_jobs (user_id, created_at desc);

      create table if not exists settings (
        key text primary key,
        value text
      );
    `);

    const admin = await rawQuery("select id from users where username = $1 limit 1", ["admin"]);
    if (!admin.rowCount) {
      await rawQuery(
        `insert into users (id, username, password_hash, role, enabled, created_at)
         values ($1, $2, $3, $4, true, now())`,
        [crypto.randomUUID(), "admin", await bcrypt.hash("admin123", 10), "admin"]
      );
    }
  })();

  return schemaReady;
}

function toCamel(row) {
  if (!row) return null;
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  return mapped;
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, password_hash, ...safeUser } = user;
  return safeUser;
}

module.exports = {
  ensureSchema,
  query,
  toCamel,
  publicUser
};
