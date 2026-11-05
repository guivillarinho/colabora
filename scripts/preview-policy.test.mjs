import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import {
  previewEnvironment,
  applyPreviewEnvironment,
} from "./preview-policy.mjs";
const base = {
  VERCEL_ENV: "preview",
  VERCEL_URL: "colabora-test.vercel.app",
  COLABORA_PREVIEW_DB_HOST: "ep-test.sa-east-1.aws.neon.tech",
  DATABASE_URL:
    "postgresql://test:synthetic@ep-test-pooler.sa-east-1.aws.neon.tech/test",
  SESSION_SECRET: "test-only-".repeat(5),
};
test("does not change production configuration", () => {
  const env = { VERCEL_ENV: "production" };
  assert.equal(previewEnvironment(env), env);
});
test("refuses preview without approved isolation metadata", () => {
  assert.throws(() =>
    previewEnvironment({ ...base, COLABORA_PREVIEW_DB_HOST: "" }),
  );
  assert.throws(() =>
    previewEnvironment({
      ...base,
      DATABASE_URL:
        "postgresql://test:synthetic@ep-production.aws.neon.tech/main",
    }),
  );
  assert.throws(() =>
    previewEnvironment({
      ...base,
      DATABASE_URL_UNPOOLED:
        "postgresql://test:synthetic@ep-production.aws.neon.tech/main",
    }),
  );
});
test("accepts pooled/unpooled variants of only the approved endpoint", () => {
  assert.equal(
    previewEnvironment({
      ...base,
      DATABASE_URL_UNPOOLED: base.DATABASE_URL.replace("-pooler.", "."),
    }).DB_SSL,
    "true",
  );
});
test("uses only the Vercel-managed isolated Neon credentials in Preview", () => {
  const env = previewEnvironment({
    ...base,
    DATABASE_URL: "postgresql://prod:secret@prod.neon.tech/main",
    COLABORA_PREVIEW_DATABASE_URL:
      "postgresql://stage:secret@ep-test-pooler.sa-east-1.aws.neon.tech/stage",
    COLABORA_PREVIEW_DATABASE_URL_UNPOOLED:
      "postgresql://stage:secret@ep-test.sa-east-1.aws.neon.tech/stage",
    COLABORA_PREVIEW_POSTGRES_HOST: "ep-test.sa-east-1.aws.neon.tech",
    COLABORA_PREVIEW_PGPASSWORD: "stage-secret",
  });
  assert.equal(env.DATABASE_URL, "postgresql://stage:secret@ep-test-pooler.sa-east-1.aws.neon.tech/stage");
  assert.equal(env.DATABASE_URL_UNPOOLED, "postgresql://stage:secret@ep-test.sa-east-1.aws.neon.tech/stage");
  assert.equal(env.COLABORA_PREVIEW_PGPASSWORD, undefined);
  assert.doesNotMatch(env.DATABASE_URL, /prod\.neon\.tech/);
});
test("isolates origin, clears service credentials and legacy database aliases", () => {
  const env = previewEnvironment({
    ...base,
    GEMINI_ENABLED: "true",
    GOOGLE_ENABLED: "true",
    GEMINI_API_KEY: "test-key",
    BREVO_API_KEY: "test-key",
    BLOB_READ_WRITE_TOKEN: "test-key",
    VAPID_PRIVATE_KEY: "test-key",
    DB_HOST: "old",
    PGPASSWORD: "old",
    POSTGRES_URL: "old",
    REMINDER_DISPATCH_SECRET: "old",
  });
  for (const key of [
    "GEMINI_API_KEY",
    "BREVO_API_KEY",
    "BLOB_READ_WRITE_TOKEN",
    "VAPID_PRIVATE_KEY",
    "REMINDER_DISPATCH_SECRET",
  ])
    assert.equal(env[key], "");
  assert.equal(env.GEMINI_ENABLED, "false");
  assert.equal(env.GOOGLE_ENABLED, "false");
  assert.equal(env.WEB_ORIGIN, "https://colabora-test.vercel.app");
  assert.equal(env.PUBLIC_APP_URL, env.WEB_ORIGIN);
});
test("rejects weak session secret and wildcard/invalid preview URL", () => {
  assert.throws(() => previewEnvironment({ ...base, SESSION_SECRET: "weak" }));
  assert.throws(() =>
    previewEnvironment({ ...base, VERCEL_URL: "*.vercel.app" }),
  );
});

test("removes inherited DB overrides instead of injecting empty/undefined values", () => {
  const env = {
    ...base,
    DB_HOST: "production",
    DB_SCHEMA: "production",
    PGPASSWORD: "production",
    POSTGRES_URL: "production",
  };
  applyPreviewEnvironment(env);
  assert.equal(env.DB_HOST, undefined);
  assert.equal(env.PGPASSWORD, undefined);
  assert.equal(env.POSTGRES_URL, undefined);
  assert.equal(env.DB_SCHEMA, "public");
  assert.equal(env.DATABASE_URL, base.DATABASE_URL);
});

test("build refuses an unsafe Preview before compiling, packaging or migrating", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./build-vercel.mjs", import.meta.url))],
    {
      env: {
        ...process.env,
        VERCEL: "1",
        VERCEL_ENV: "preview",
        COLABORA_PREVIEW_DB_HOST: "",
        DATABASE_URL:
          "postgresql://synthetic:do-not-log@production.invalid/database",
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Preview exige COLABORA_PREVIEW_DB_HOST/);
  assert.ok(!result.stderr.includes("do-not-log"));
  assert.ok(!result.stdout.includes("building"));
});
