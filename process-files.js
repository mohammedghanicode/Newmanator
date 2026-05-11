const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

if (process.argv.length < 3) {
  console.log(
    "❌ Usage: node process-files.js [--outdir <dir>] <file1> [file2] [...]",
  );
  console.log("   Supports both .zip and .html files");
  process.exit(1);
}

// Accept optional: --outdir <dir>
let argvIndex = 2;
let workingDir = path.join(__dirname, "unzipped"); // default
if (process.argv[2] === "--outdir") {
  if (!process.argv[3]) {
    console.error("❌ Missing value for --outdir");
    process.exit(1);
  }
  workingDir = process.argv[3];
  argvIndex = 4;
}
const inputFiles = process.argv.slice(argvIndex);

// 1. Clear previous contents for this workingDir
if (fs.existsSync(workingDir)) {
  fs.rmSync(workingDir, { recursive: true });
}
fs.mkdirSync(workingDir, { recursive: true });

console.log(`📁 Processing ${inputFiles.length} file(s)...`);

// 2. Process each input file
let processedCount = 0;
for (const inputFile of inputFiles) {
  if (!fs.existsSync(inputFile)) {
    console.warn(`⚠️  File not found: ${inputFile}`);
    continue;
  }

  const ext = path.extname(inputFile).toLowerCase();
  const baseName = path.basename(inputFile, ext);

  try {
    if (ext === ".zip") {
      // Extract ZIP to working directory
      console.log(`📦 Unzipping: ${inputFile}`);
      const zip = new AdmZip(inputFile);
      const extractDir = path.join(workingDir, baseName);
      zip.extractAllTo(extractDir, true);
      processedCount++;
    } else if (ext === ".html") {
      // Copy HTML file to working directory structure
      console.log(`📄 Processing HTML: ${inputFile}`);
      const targetDir = path.join(workingDir, baseName);
      fs.mkdirSync(targetDir, { recursive: true });

      // Copy the HTML file as report.html
      fs.copyFileSync(inputFile, path.join(targetDir, "report.html"));

      // Look for companion JSON file (same name, different extension)
      const inputDir = path.dirname(inputFile);
      const jsonFile = path.join(inputDir, baseName + ".json");
      const reportJsonFile = path.join(inputDir, "report.json");

      // Try multiple JSON naming conventions
      let jsonSource = null;
      if (fs.existsSync(jsonFile)) {
        jsonSource = jsonFile;
      } else if (fs.existsSync(reportJsonFile)) {
        jsonSource = reportJsonFile;
      }

      if (jsonSource) {
        console.log(`  📋 Found companion JSON: ${path.basename(jsonSource)}`);
        fs.copyFileSync(jsonSource, path.join(targetDir, "report.json"));
      } else {
        console.log(
          `  ℹ️  No companion JSON file found (looked for ${baseName}.json or report.json)`,
        );
      }

      processedCount++;
    } else {
      console.warn(
        `❓ Unsupported file type: ${inputFile} (only .zip and .html are supported)`,
      );
    }
  } catch (err) {
    console.error(`❌ Failed to process ${inputFile}: ${err.message}`);
  }
}

if (processedCount === 0) {
  console.error("❌ No files were processed successfully");
  process.exit(1);
}

console.log(`✅ Successfully processed ${processedCount} file(s)`);
console.log(`📁 Files prepared in: ${workingDir}`);
console.log("🔄 Ready for summarization...");

// Note: We don't call summarise.js here - let the PowerShell script handle the pipelin
