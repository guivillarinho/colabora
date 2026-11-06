import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import {
  previewEnvironment,
  applyPreviewEnvironment,
} from "./preview-policy.mjs";
const geminiKey = "synthetic-gemini-key-0001";
const googleSecret = "synthetic-google-secret";
const googleClientId = "1234567890-abc123.apps.googleusercontent.com";
const googleKey = Buffer.alloc(32, 9).toString("base64");
const previewCallback = "https://colabora-test.vercel.app/api/google/callback";
const base = {
  VERCEL_ENV: "preview",
  VERCEL_URL: "colabora-test.vercel.app",
  COLABORA_PREVIEW_DB_HOST: "ep-test.sa-east-1.aws.neon.tech",
  DATABASE_URL:
    "postgresql://test:synthetic@ep-test-pooler.sa-east-1.aws.neon.tech/test",
  SESSION_SECRET: "test-only-".repeat(5),
};
test("does not change production configuration", () => {
  const env = {
    VERCEL_ENV: "production",
    GEMINI_ENABLED: "false",
    COLABORA_PREVIEW_GEMINI: "true",
    COLABORA_PREVIEW_GEMINI_API_KEY: geminiKey,
    COLABORA_PREVIEW_GOOGLE: "true",
    COLABORA_PREVIEW_BLOB: "true",
  };
  assert.equal(previewEnvironment(env), env);
  assert.equal(env.GEMINI_ENABLED, "false");
  assert.equal(env.GEMINI_API_KEY, undefined);
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

test("enables Blob only from a prefixed token matching the isolated store", () => {
  const token = "vercel_blob_rw_PreviewStore123_synthetic-preview-token-0001";
  const env = {
    ...base,
    BLOB_READ_WRITE_TOKEN: "inherited-production-token",
    COLABORA_PREVIEW_BLOB: "true",
    COLABORA_PREVIEW_BLOB_STORE_ID: "store_PreviewStore123",
    COLABORA_PREVIEW_BLOB_READ_WRITE_TOKEN: token,
  };
  applyPreviewEnvironment(env);
  assert.equal(env.BLOB_READ_WRITE_TOKEN, token);
  assert.equal(env.COLABORA_PREVIEW_BLOB_READ_WRITE_TOKEN, undefined);
  assert.equal(env.COLABORA_PREVIEW_BLOB_STORE_ID, undefined);
  assert.equal(env.GEMINI_ENABLED, "false");
  assert.equal(env.GOOGLE_ENABLED, "false");
});

test("keeps Blob off unless its Preview flag is exactly true", () => {
  for (const flag of [undefined, "TRUE", "1", "false"]) {
    const env = previewEnvironment({
      ...base,
      BLOB_READ_WRITE_TOKEN: "inherited-production-token",
      COLABORA_PREVIEW_BLOB: flag,
      COLABORA_PREVIEW_BLOB_STORE_ID: "store_PreviewStore123",
      COLABORA_PREVIEW_BLOB_READ_WRITE_TOKEN:
        "vercel_blob_rw_PreviewStore123_synthetic-preview-token-0001",
    });
    assert.equal(env.BLOB_READ_WRITE_TOKEN, "");
  }
});

test("rejects inherited, malformed or mismatched Blob credentials without logging them", () => {
  for (const token of [
    undefined,
    "malformed-secret",
    "vercel_blob_rw_OtherStore_synthetic-secret-token-0001",
  ]) {
    assert.throws(
      () =>
        previewEnvironment({
          ...base,
          COLABORA_PREVIEW_BLOB: "true",
          COLABORA_PREVIEW_BLOB_STORE_ID: "store_PreviewStore123",
          COLABORA_PREVIEW_BLOB_READ_WRITE_TOKEN: token,
          BLOB_READ_WRITE_TOKEN: "inherited-production-token",
        }),
      (error) => {
        assert.match(error.message, /token herdado não é reutilizado/);
        assert.equal(error.message.includes("synthetic-secret"), false);
        assert.equal(
          error.message.includes("inherited-production-token"),
          false,
        );
        return true;
      },
    );
  }
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
  assert.equal(
    env.DATABASE_URL,
    "postgresql://stage:secret@ep-test-pooler.sa-east-1.aws.neon.tech/stage",
  );
  assert.equal(
    env.DATABASE_URL_UNPOOLED,
    "postgresql://stage:secret@ep-test.sa-east-1.aws.neon.tech/stage",
  );
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

test("keeps Gemini and Google off unless the Preview flags are exactly true", () => {
  const env = previewEnvironment({
    ...base,
    COLABORA_PREVIEW_GEMINI: "TRUE",
    COLABORA_PREVIEW_GOOGLE: "1",
    GEMINI_ENABLED: "true",
    GOOGLE_ENABLED: "true",
    GEMINI_API_KEY: geminiKey,
    GOOGLE_CLIENT_SECRET: googleSecret,
    COLABORA_PREVIEW_GEMINI_API_KEY: geminiKey,
    BLOB_READ_WRITE_TOKEN: "blob-token",
  });
  assert.equal(env.GEMINI_ENABLED, "false");
  assert.equal(env.GOOGLE_ENABLED, "false");
  assert.equal(env.GEMINI_API_KEY, "");
  assert.equal(env.GOOGLE_CLIENT_SECRET, "");
  assert.equal(env.BLOB_READ_WRITE_TOKEN, "");
  assert.equal(env.COLABORA_PREVIEW_GEMINI_API_KEY, undefined);
});

test("enables text Gemini and Calendar only from prefixed Preview secrets", () => {
  const env = {
    ...base,
    GEMINI_API_KEY: "inherited-production-gemini",
    GOOGLE_CLIENT_SECRET: "inherited-production-google",
    GOOGLE_REDIRECT_URI: "https://production.example/api/google/callback",
    BLOB_READ_WRITE_TOKEN: "blob-token",
    COLABORA_PREVIEW_GEMINI: "true",
    COLABORA_PREVIEW_GEMINI_API_KEY: geminiKey,
    COLABORA_PREVIEW_GOOGLE: "true",
    COLABORA_PREVIEW_GOOGLE_CLIENT_ID: googleClientId,
    COLABORA_PREVIEW_GOOGLE_CLIENT_SECRET: googleSecret,
    COLABORA_PREVIEW_GOOGLE_TOKEN_ENCRYPTION_KEY: googleKey,
    COLABORA_PREVIEW_GOOGLE_REDIRECT_URI: previewCallback,
  };
  applyPreviewEnvironment(env);
  assert.equal(env.GEMINI_ENABLED, "true");
  assert.equal(env.GEMINI_API_KEY, geminiKey);
  assert.equal(env.GOOGLE_ENABLED, "true");
  assert.equal(env.GOOGLE_CLIENT_ID, googleClientId);
  assert.equal(env.GOOGLE_CLIENT_SECRET, googleSecret);
  assert.equal(env.GOOGLE_TOKEN_ENCRYPTION_KEY, googleKey);
  assert.equal(env.GOOGLE_REDIRECT_URI, previewCallback);
  assert.equal(env.PUBLIC_APP_URL, "https://colabora-test.vercel.app");
  assert.equal(env.BLOB_READ_WRITE_TOKEN, "");
  assert.equal(env.COLABORA_PREVIEW_GEMINI_API_KEY, undefined);
  assert.equal(env.COLABORA_PREVIEW_GOOGLE_CLIENT_SECRET, undefined);
  assert.equal(env.COLABORA_PREVIEW_GOOGLE, undefined);
});

test("refuses inherited Gemini and Google secrets and a foreign OAuth callback", () => {
  assert.throws(
    () =>
      previewEnvironment({
        ...base,
        COLABORA_PREVIEW_GEMINI: "true",
        GEMINI_API_KEY: geminiKey,
      }),
    (error) => {
      assert.match(error.message, /GEMINI_API_KEY herdada não é reutilizada/);
      assert.equal(error.message.includes(geminiKey), false);
      return true;
    },
  );
  assert.throws(
    () =>
      previewEnvironment({
        ...base,
        COLABORA_PREVIEW_GOOGLE: "true",
        COLABORA_PREVIEW_GOOGLE_CLIENT_ID: googleClientId,
        COLABORA_PREVIEW_GOOGLE_CLIENT_SECRET: googleSecret,
        COLABORA_PREVIEW_GOOGLE_TOKEN_ENCRYPTION_KEY: googleKey,
        COLABORA_PREVIEW_GOOGLE_REDIRECT_URI:
          "https://production.example/api/google/callback",
        GOOGLE_CLIENT_SECRET: "do-not-log-production-secret",
      }),
    (error) => {
      assert.match(
        error.message,
        /callback deste deployment: https:\/\/colabora-test\.vercel\.app\/api\/google\/callback/,
      );
      assert.equal(error.message.includes("do-not-log"), false);
      assert.equal(error.message.includes(googleSecret), false);
      return true;
    },
  );
  assert.throws(() =>
    previewEnvironment({
      ...base,
      SESSION_SECRET: googleKey,
      COLABORA_PREVIEW_GOOGLE: "true",
      COLABORA_PREVIEW_GOOGLE_CLIENT_ID: googleClientId,
      COLABORA_PREVIEW_GOOGLE_CLIENT_SECRET: googleSecret,
      COLABORA_PREVIEW_GOOGLE_TOKEN_ENCRYPTION_KEY: googleKey,
    }),
  );
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

test("production build refuses Gemini or Google before compiling", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./build-vercel.mjs", import.meta.url))],
    {
      env: {
        ...process.env,
        VERCEL: "1",
        VERCEL_ENV: "production",
        GEMINI_ENABLED: "true",
        GEMINI_API_KEY: "do-not-log-gemini",
        GOOGLE_ENABLED: "false",
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Production permanece desligado/);
  assert.equal(result.stderr.includes("do-not-log-gemini"), false);
  assert.ok(!result.stdout.includes("building"));
});
