#!/usr/bin/env -S deno run -A
/**
 * Build script for publishing the CLI to npm as @dgellow/rfc
 * Creates platform-specific packages:
 *   @dgellow/rfc              - Main package with wrapper (tiny)
 *   @dgellow/rfc-linux-x64    - Linux x64 binary
 *   @dgellow/rfc-linux-arm64  - Linux ARM64 binary
 *   @dgellow/rfc-darwin-x64   - macOS Intel binary
 *   @dgellow/rfc-darwin-arm64 - macOS Apple Silicon binary
 *   @dgellow/rfc-win32-x64    - Windows x64 binary
 *
 * Usage:
 *   deno run -A scripts/build_npm.ts              # Build all platforms
 *   deno run -A scripts/build_npm.ts --platform linux-x64  # Build one
 */

const args = parseFlags(Deno.args);

const denoJson = JSON.parse(await Deno.readTextFile("./deno.json"));
const version = denoJson.version;

if (!version) {
  console.error("Error: No version in deno.json");
  Deno.exit(1);
}

console.log(`Building @dgellow/rfc version ${version}...`);

try {
  await Deno.remove("./npm", { recursive: true });
} catch { /* doesn't exist */ }

const allPlatforms = [
  { target: "x86_64-unknown-linux-gnu", pkg: "@dgellow/rfc-linux-x64", os: "linux", cpu: "x64", bin: "rfc" },
  { target: "aarch64-unknown-linux-gnu", pkg: "@dgellow/rfc-linux-arm64", os: "linux", cpu: "arm64", bin: "rfc" },
  { target: "x86_64-apple-darwin", pkg: "@dgellow/rfc-darwin-x64", os: "darwin", cpu: "x64", bin: "rfc" },
  { target: "aarch64-apple-darwin", pkg: "@dgellow/rfc-darwin-arm64", os: "darwin", cpu: "arm64", bin: "rfc" },
  { target: "x86_64-pc-windows-msvc", pkg: "@dgellow/rfc-win32-x64", os: "win32", cpu: "x64", bin: "rfc.exe" },
];

const platforms = args.platform
  ? allPlatforms.filter((p) => `${p.os}-${p.cpu}` === args.platform)
  : allPlatforms;

if (platforms.length === 0) {
  console.error(`Unknown platform "${args.platform}"`);
  Deno.exit(1);
}

for (const platform of platforms) {
  const pkgDir = `./npm/${platform.pkg.replace("@dgellow/", "")}`;
  await Deno.mkdir(`${pkgDir}/bin`, { recursive: true });

  console.log(`Compiling for ${platform.target}...`);
  const cmd = new Deno.Command("deno", {
    args: [
      "compile", "-A",
      "--target", platform.target,
      "--output", `${pkgDir}/bin/${platform.bin}`,
      "./main.ts",
    ],
    stdout: "inherit",
    stderr: "inherit",
  });

  const result = await cmd.output();
  if (!result.success) {
    console.error(`Failed to compile for ${platform.target}`);
    Deno.exit(1);
  }

  await Deno.writeTextFile(
    `${pkgDir}/package.json`,
    JSON.stringify({
      name: platform.pkg,
      version,
      description: `Platform binary for @dgellow/rfc (${platform.os}-${platform.cpu})`,
      license: "MIT",
      repository: { type: "git", url: "git+https://github.com/dgellow/rfc.git" },
      os: [platform.os],
      cpu: [platform.cpu],
    }, null, 2) + "\n",
  );

  const stat = await Deno.stat(`${pkgDir}/bin/${platform.bin}`);
  console.log(`  ${platform.pkg}: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
}

// Main package
console.log("\nCreating main @dgellow/rfc package...");
const mainDir = "./npm/rfc";
await Deno.mkdir(mainDir, { recursive: true });

await Deno.writeTextFile(`${mainDir}/rfc.js`, `#!/usr/bin/env node
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const PLATFORMS = {
  "linux-x64": "rfc-linux-x64",
  "linux-arm64": "rfc-linux-arm64",
  "darwin-x64": "rfc-darwin-x64",
  "darwin-arm64": "rfc-darwin-arm64",
  "win32-x64": "rfc-win32-x64",
};

const key = \`\${process.platform}-\${process.arch}\`;
const pkgSuffix = PLATFORMS[key];

if (!pkgSuffix) {
  console.error(\`Unsupported platform: \${key}\`);
  console.error("Use Deno instead: deno install -g -A --name rfc jsr:@dgellow/rfc/cli");
  process.exit(1);
}

const binName = process.platform === "win32" ? "rfc.exe" : "rfc";
let binPath;

for (const loc of [
  path.join(__dirname, "..", pkgSuffix, "bin", binName),
  path.join(__dirname, "..", "..", pkgSuffix, "bin", binName),
]) {
  if (fs.existsSync(loc)) { binPath = loc; break; }
}

if (!binPath) {
  try {
    binPath = path.join(path.dirname(require.resolve(\`@dgellow/\${pkgSuffix}/package.json\`)), "bin", binName);
  } catch {
    console.error(\`Binary not found for \${key}. Try: npm install @dgellow/rfc\`);
    process.exit(1);
  }
}

const child = spawn(binPath, process.argv.slice(2), { stdio: "inherit" });
child.on("error", (err) => { console.error(\`Failed to start rfc: \${err.message}\`); process.exit(1); });
for (const sig of Object.keys(os.constants.signals)) { try { process.on(sig, () => child.kill(sig)); } catch {} }
child.on("exit", (code, signal) => { if (signal) process.kill(process.pid, signal); else process.exit(code ?? 0); });
`);

await Deno.writeTextFile(
  `${mainDir}/package.json`,
  JSON.stringify({
    name: "@dgellow/rfc",
    version,
    description: "Read, search, and navigate IETF RFCs from your terminal",
    license: "MIT",
    repository: { type: "git", url: "git+https://github.com/dgellow/rfc.git" },
    bugs: { url: "https://github.com/dgellow/rfc/issues" },
    homepage: "https://github.com/dgellow/rfc#readme",
    keywords: ["rfc", "ietf", "cli", "tui", "standards"],
    bin: { rfc: "./rfc.js" },
    files: ["rfc.js"],
    optionalDependencies: {
      "@dgellow/rfc-linux-x64": version,
      "@dgellow/rfc-linux-arm64": version,
      "@dgellow/rfc-darwin-x64": version,
      "@dgellow/rfc-darwin-arm64": version,
      "@dgellow/rfc-win32-x64": version,
    },
  }, null, 2) + "\n",
);

await Deno.copyFile("LICENSE", `${mainDir}/LICENSE`);
await Deno.copyFile("README.md", `${mainDir}/README.md`);

console.log("\nBuild complete! Output in ./npm");

function parseFlags(args: string[]): { platform?: string } {
  const idx = args.indexOf("--platform");
  return { platform: idx >= 0 ? args[idx + 1] : undefined };
}
