import * as esbuild from "esbuild";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const envRaw = readFileSync(".env", "utf-8");
const testVault = envRaw
  .split("\n")
  .find((l) => l.startsWith("TEST_VAULT="))
  ?.split("=")
  .slice(1)
  .join("=")
  .trim();

function syncToVault() {
  if (!testVault) {
    console.warn("⚠️  TEST_VAULT not set in .env — skipping sync to vault");
    return;
  }
  const dest = `${testVault}/.obsidian/plugins/obsidian-anki-sync/`;
  try {
    execSync(`rsync -a --delete main.js manifest.json styles.css "${dest}"`, {
      stdio: "inherit",
    });
    console.log(`📦 Synced plugin to vault`);
  } catch {
    console.error("❌ rsync failed");
  }
}

const isWatch = process.argv.includes("--watch");

const syncPlugin = {
  name: "sync-to-vault",
  setup(build) {
    build.onEnd(() => {
      syncToVault();
    });
  },
};

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
  plugins: isWatch ? [syncPlugin] : [],
};

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    console.log("👀 Watching for changes...");
  } else {
    await esbuild.build(config);
    syncToVault();
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
