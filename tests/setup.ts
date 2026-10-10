import { config } from "dotenv";

config();
// Point every test at the isolated test database and run jobs in-process.
const base = new URL(process.env.DATABASE_URL!);
base.pathname = `${base.pathname}_test`;
process.env.DATABASE_URL = base.toString();
process.env.INLINE_JOBS = "true";
delete process.env.REDIS_URL;
process.env.SHOPIFY_WEBHOOK_SECRET = "test_shopify_secret";
process.env.META_APP_SECRET = "test_meta_secret";
process.env.AI_PROVIDER = "local";
