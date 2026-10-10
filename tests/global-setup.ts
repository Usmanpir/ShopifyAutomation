import { execSync } from "node:child_process";
import { config } from "dotenv";
import { Client } from "pg";

/** Creates (if needed) and migrates the isolated integration-test database. */
export default async function setup() {
  config();
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL must be set for tests");
  const url = new URL(base);
  const testDb = `${url.pathname.slice(1)}_test`;
  const admin = new URL(base);
  admin.pathname = "/postgres";
  admin.search = "";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [testDb]);
  if (!exists.rowCount) await client.query(`CREATE DATABASE "${testDb}"`);
  await client.end();

  url.pathname = `/${testDb}`;
  process.env.TEST_DATABASE_URL = url.toString();
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env, DATABASE_URL: url.toString() } });
}
