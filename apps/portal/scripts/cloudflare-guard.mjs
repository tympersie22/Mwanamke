import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// OpenNext embeds .env files in its Worker, including development values.
// Build in a clean checkout; configure runtime secrets using Wrangler instead.
if (process.argv[2] === "source") {
  for (const directory of [process.cwd(), path.resolve("../..")]) {
    const files = await readdir(directory);
    if (files.some((file) => /^\.env(?:\.|$)|^\.dev\.vars(?:\.|$)/.test(file))) {
      throw new Error("Cloudflare builds require a clean checkout without .env or .dev.vars files. Keep local secrets outside the build and use Worker secrets for runtime credentials.");
    }
  }
} else if (process.argv[2] === "bundle") {
  const compiledEnv = await readFile(".open-next/cloudflare/next-env.mjs", "utf8");
  const emptyEnvironments = ["production", "development", "test"].map((mode) => `export const ${mode} = {};`).join("\n");
  if (compiledEnv.trim() !== emptyEnvironments) throw new Error("Refusing upload: the Worker contains embedded environment-file values.");
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (/^\.env(?:\.|$)|^\.dev\.vars(?:\.|$)|\.md$/i.test(entry.name)) throw new Error("Refusing upload: an environment or Markdown file is in the public assets.");
      if (entry.isDirectory()) await inspect(path.join(directory, entry.name));
    }
  }
  await inspect(".open-next/assets");
} else {
  throw new Error("Expected source or bundle check.");
}
console.log("Cloudflare build privacy check passed.");
