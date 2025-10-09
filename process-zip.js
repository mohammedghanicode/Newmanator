const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { execSync } = require("child_process");

if (process.argv.length < 3) {
  console.log("❌ Usage: node process-zip.js <path/to/zipfile>");
  process.exit(1);
}

const zipPath = process.argv[2];
const unzipTo = path.join(__dirname, "unzipped");

// 1. Clear previous contents
if (fs.existsSync(unzipTo)) {
  fs.rmSync(unzipTo, { recursive: true });
}
fs.mkdirSync(unzipTo);

// 2. Unzip
try {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(unzipTo, true);
  console.log(`📦 Unzipped: ${zipPath}`);
} catch (err) {
  console.error(`❌ Failed to unzip: ${err.message}`);
  process.exit(1);
}

// 3. Run summarise.js
try {
  execSync("node summarise.js", { stdio: "inherit" });
  console.log("✅ Done! Check summary.html");
} catch (err) {
  console.error(`❌ Failed to run summarise.js: ${err.message}`);
}
