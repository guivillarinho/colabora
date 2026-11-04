import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".vercel/output");
const fn = path.join(output, "functions/server.func");

function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error || result.status !== 0)
    throw new Error(`Falha ao executar ${command} ${args.join(" ")}`);
}

run("npm", ["run", "build"], path.join(root, "web"), {
  ...process.env,
  VITE_API_URL: "",
  VITE_CLOUD_UPLOADS: "true",
});
run("npm", ["run", "build"], path.join(root, "api"));
if (process.env.VERCEL) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw new Error("Configure SESSION_SECRET aleatório antes de publicar autenticação.");
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    throw new Error("Conecte um armazenamento Blob privado antes de publicar.");
  if (
    !process.env.VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.REMINDER_DISPATCH_SECRET
  )
    throw new Error("Configure chaves VAPID e REMINDER_DISPATCH_SECRET para notificações push.");
  run("node", ["dist/database/migrate.js"], path.join(root, "api"));
}
await rm(output, { recursive: true, force: true });
await mkdir(fn, { recursive: true });
await cp(path.join(root, "web/dist"), path.join(output, "static"), {
  recursive: true,
});
await cp(path.join(root, "api/dist"), path.join(fn, "dist"), {
  recursive: true,
});
const pkg = JSON.parse(
  await readFile(path.join(root, "api/package.json"), "utf8"),
);
delete pkg.devDependencies;
delete pkg.scripts;
await writeFile(path.join(fn, "package.json"), JSON.stringify(pkg));
await cp(
  path.join(root, "api/package-lock.json"),
  path.join(fn, "package-lock.json"),
);
run(
  "npm",
  ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
  fn,
);
await writeFile(
  path.join(fn, "index.js"),
  `
require('reflect-metadata');
const { createApplication } = require('./dist/bootstrap');
let initialization;
module.exports = async function handler(req, res) {
  try {
    initialization ||= createApplication().then(async app => { await app.init(); return app.getHttpAdapter().getInstance(); }).catch(error => { initialization = undefined; throw error; });
    const server = await initialization;
    server(req, res);
    // Keep the Vercel invocation alive until Express has finished streaming the response.
    await new Promise(resolve => {
      if (res.writableEnded) return resolve();
      res.once('finish', resolve);
      res.once('close', resolve);
    });
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({message:'Serviço temporariamente indisponível.'}));
  }
};
`,
);
await writeFile(
  path.join(fn, ".vc-config.json"),
  JSON.stringify({
    runtime: "nodejs24.x",
    regions: ["gru1"],
    handler: "index.js",
    launcherType: "Nodejs",
    supportsResponseStreaming: true,
    maxDuration: 60,
  }),
);
await writeFile(
  path.join(output, "config.json"),
  JSON.stringify({
    version: 3,
    routes: [
      {
        src: "/.*",
        headers: {
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
          "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https://photon.komoot.io https://blob.vercel-storage.com https://*.blob.vercel-storage.com; frame-src https://www.openstreetmap.org; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        },
        continue: true,
      },
      {
        src: "/(health|api)(/.*)?",
        dest: "/server",
        headers: { "Cache-Control": "private, no-store" },
      },
      { src: "/server", status: 404 },
      { handle: "filesystem" },
      { src: "/.*", dest: "/index.html" },
    ],
  }),
);
console.log("Front e API preparados em .vercel/output.");
