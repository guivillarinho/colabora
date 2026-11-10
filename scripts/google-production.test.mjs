import assert from "node:assert/strict";
import test from "node:test";
import { validateProductionGoogle } from "./google-production.mjs";

const valid = {
  GOOGLE_ENABLED: "true",
  GOOGLE_CLIENT_ID: "123456-example.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "synthetic-google-client-secret",
  GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  PUBLIC_APP_URL: "https://colabora-rouge.vercel.app",
  GOOGLE_REDIRECT_URI: "https://colabora-rouge.vercel.app/api/google/callback",
  SESSION_SECRET: "synthetic-independent-session-secret",
};
test("accepts explicit production Google configuration and leaves disabled apps alone", () => {
  validateProductionGoogle(valid);
  validateProductionGoogle({});
});
test("rejects missing credentials and a callback outside the app", () => {
  for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_TOKEN_ENCRYPTION_KEY", "PUBLIC_APP_URL"]) {
    assert.throws(() => validateProductionGoogle({ ...valid, [key]: "" }));
  }
  assert.throws(() => validateProductionGoogle({ ...valid, GOOGLE_REDIRECT_URI: "https://other.example/api/google/callback" }));
  assert.throws(() => validateProductionGoogle({ ...valid, SESSION_SECRET: valid.GOOGLE_TOKEN_ENCRYPTION_KEY }));
});
