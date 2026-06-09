import * as esbuild from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load TEST_VAULT from .env manually (no dotenv dependency needed at runtime)
const envRaw = readFileSync(".env", "utf-8");
const testVault = envRaw
  .split("\n")
  .find((l) => l.startsWith("TEST_VAULT="))
  ?.split("=")
  .slice(1)
  .join("=")
  .trim();

function copyToVault() {
  if (!testVault) {
    console.warn("⚠️  TEST_VAULT not set in .env — skipping copy to vault");
    return;
  }
  const pluginDir = resolve(testVault, ".obsidian", "plugins", "obsidian-anki-sync");
  if (!existsSync(pluginDir)) {
    mkdirSync(pluginDir, { recursive: true });
  }
  for (const file of ["main.js", "manifest.json", "styles.css"]) {
    copyFileSync(file, resolve(pluginDir, file));
  }
  console.log(`📦 Copied to ${pluginDir}`);
}

const isWatch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const config = {
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  target: "ESNext",
  format: "cjs",
  external: ["obsidian"],
  logLevel: "info",
  sourcemap: isWatch ? "inline" : false,
  minify: !isWatch,
};

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    console.log("👀 Watching for changes...");
  } else {
    await esbuild.build(config);
    copyToVault();
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
