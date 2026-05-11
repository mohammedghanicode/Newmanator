const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

// Create necessary directories
const UPLOAD_DIR = path.join(__dirname, "uploads");
const RESULTS_DIR = path.join(__dirname, "results");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

// Storage configuration for multer - INCREASED FILE SIZE LIMIT
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionId = req.body.sessionId || uuidv4();
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    req.sessionDir = sessionDir;
    req.sessionId = sessionId;
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [".zip", ".html", ".htm"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported file type: ${ext}. Only .zip and .html files are allowed.`,
        ),
      );
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit (increased from 50MB)
  },
});

// Processing status tracking
const processingStatus = new Map();

// Active processing sessions (concurrency control)
const activeSessions = new Set();
const MAX_CONCURRENT_SESSIONS =
  Number(process.env.MAX_CONCURRENT_SESSIONS) || 3;

// Upload rate limiter
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: Number(process.env.UPLOADS_PER_MINUTE) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads, try again later" },
});

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Serve main UI
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// File upload endpoint
app.post(
  "/api/upload",
  uploadLimiter,
  upload.array("files", 20),
  (req, res) => {
    try {
      const sessionId = req.sessionId || uuidv4();
      const files = req.files;

      console.log(
        `🚀 DIAGNOSTIC: Starting processing for session ${sessionId}`,
      );
      console.log(
        `Files uploaded: ${files.map((f) => f.originalname).join(", ")}`,
      );

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      // Initialize processing status
      processingStatus.set(sessionId, {
        status: "uploaded",
        stage: "upload",
        message: `Uploaded ${files.length} file(s)`,
        files: files.map((f) => ({ name: f.originalname, size: f.size })),
        progress: 0,
        startTime: new Date(),
      });

      // Concurrency guard
      if (activeSessions.size >= MAX_CONCURRENT_SESSIONS) {
        // clean up uploaded files immediately
        setTimeout(() => {
          if (fs.existsSync(req.sessionDir))
            fs.rmSync(req.sessionDir, { recursive: true, force: true });
        }, 1000);
        return res.status(429).json({
          error: "Server busy. Too many concurrent processing sessions.",
        });
      }

      // Validate file contents (simple magic/header checks)
      const invalidFiles = [];
      for (const f of files) {
        const fp = path.join(req.sessionDir, f.originalname);
        const ext = path.extname(f.originalname).toLowerCase();
        try {
          if (ext === ".zip") {
            // Only read header for zip files (check magic bytes)
            const header = readFileHeader(fp, 8192);
            if (
              !(header.length >= 2 && header[0] === 0x50 && header[1] === 0x4b)
            ) {
              invalidFiles.push(f.originalname);
            }
          } else if (ext === ".html" || ext === ".htm") {
            // Accept HTML by extension; header-sniffing can be unreliable for HTML
          } else {
            invalidFiles.push(f.originalname);
          }
        } catch (e) {
          // If header read fails for a zip, mark it invalid. For HTML, ignore read errors.
          if (ext === ".zip") invalidFiles.push(f.originalname);
        }
      }

      if (invalidFiles.length > 0) {
        processingStatus.set(sessionId, {
          status: "error",
          stage: "validation",
          message: `Invalid uploaded files: ${invalidFiles.join(", ")}`,
          progress: 0,
          updatedAt: new Date(),
        });
        // remove uploaded files
        if (fs.existsSync(req.sessionDir))
          fs.rmSync(req.sessionDir, { recursive: true, force: true });
        return res.status(400).json({
          error: `Invalid uploaded files: ${invalidFiles.join(", ")}`,
        });
      }

      // Mark session as active and start processing asynchronously
      activeSessions.add(sessionId);
      processFiles(sessionId, req.sessionDir, files);

      res.json({
        sessionId,
        message: `Successfully uploaded ${files.length} file(s)`,
        files: files.map((f) => ({ name: f.originalname, size: f.size })),
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Upload failed: " + error.message });
    }
  },
);

// Get processing status
app.get("/api/status/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const status = processingStatus.get(sessionId);

  if (!status) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.json(status);
});

// Get processing results
app.get("/api/results/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const resultsPath = path.join(RESULTS_DIR, sessionId, "summary.html");

  console.log(`DIAGNOSTIC: Looking for results at: ${resultsPath}`);

  if (!fs.existsSync(resultsPath)) {
    return res.status(404).json({ error: "Results not found" });
  }

  const htmlContent = fs.readFileSync(resultsPath, "utf8");
  console.log(
    `DIAGNOSTIC: Results found, length: ${htmlContent.length} characters`,
  );

  res.json({
    sessionId,
    html: htmlContent,
    generatedAt: new Date(fs.statSync(resultsPath).mtime),
  });
});

// Download summary.html
app.get("/api/download/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const resultsPath = path.join(RESULTS_DIR, sessionId, "summary.html");

  if (!fs.existsSync(resultsPath)) {
    return res.status(404).json({ error: "Results not found" });
  }

  res.download(resultsPath, `newman-summary-${sessionId}.html`);
});

// Server-sent events for real-time updates
app.get("/api/events/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const sendUpdate = () => {
    const status = processingStatus.get(sessionId);
    if (status) {
      res.write(`data: ${JSON.stringify(status)}\n\n`);

      if (status.status === "complete" || status.status === "error") {
        res.end();
        return;
      }
    }
  };

  // Send initial status
  sendUpdate();

  // Send updates every 2 seconds
  const interval = setInterval(sendUpdate, 2000);

  req.on("close", () => {
    clearInterval(interval);
  });
});

// DIAGNOSTIC: Enhanced processing function with detailed logging
async function processFiles(sessionId, uploadDir, files) {
  try {
    console.log(`DIAGNOSTIC: Processing files for session ${sessionId}`);
    console.log(`Upload directory: ${uploadDir}`);
    console.log(
      `📋 Files to process: ${files.map((f) => f.originalname).join(", ")}`,
    );

    // Update status: validation
    updateStatus(
      sessionId,
      "processing",
      "validation",
      "Validating uploaded files...",
      20,
    );

    // Create results directory for this session
    const sessionResultsDir = path.join(RESULTS_DIR, sessionId);
    if (!fs.existsSync(sessionResultsDir)) {
      fs.mkdirSync(sessionResultsDir, { recursive: true });
    }
    console.log(`Session results directory: ${sessionResultsDir}`);

    // Update status: processing
    updateStatus(
      sessionId,
      "processing",
      "processing",
      "Processing report files...",
      40,
    );

    // Build file arguments for process-files.js
    const fileArgs = files.map((f) => path.join(uploadDir, f.originalname));
    // Diagnostic: list files actually present on disk in the uploadDir
    try {
      const onDisk =
        fs.existsSync(req.sessionDir) ? fs.readdirSync(req.sessionDir) : [];
      console.log(`📋 Files on disk in upload dir: ${onDisk.join(", ")}`);
    } catch (e) {
      console.warn("Could not list upload dir contents", e.message);
    }
    console.log(`📋 File arguments: ${fileArgs}`);

    // Check if process-files.js exists
    const processFilesPath = path.join(__dirname, "process-files.js");
    if (!fs.existsSync(processFilesPath)) {
      throw new Error(`process-files.js not found at ${processFilesPath}`);
    }

    // Call process-files.js
    console.log(`DIAGNOSTIC: Calling process-files.js...`);
    // Use a per-session working directory to avoid races between sessions
    const sessionUnzippedDir = path.join(__dirname, "unzipped", sessionId);
    if (!fs.existsSync(sessionUnzippedDir))
      fs.mkdirSync(sessionUnzippedDir, { recursive: true });

    // Run process-files.js without a shell to avoid command injection
    await executeCommand(
      "node",
      [
        "--max-old-space-size=4096",
        "process-files.js",
        "--outdir",
        sessionUnzippedDir,
        ...fileArgs,
      ],
      __dirname,
      sessionId,
    );

    // Update status: collation
    updateStatus(
      sessionId,
      "processing",
      "collation",
      "Collating reports into summary...",
      70,
    );

    // Check if summarise.js exists
    const summarisePath = path.join(__dirname, "summarise.js");
    if (!fs.existsSync(summarisePath)) {
      throw new Error(`summarise.js not found at ${summarisePath}`);
    }

    // Call summarise.js
    console.log(`DIAGNOSTIC: Calling summarise.js...`);
    // Summarise should read from the session unzipped dir and write directly to the session results
    const targetSummary = path.join(sessionResultsDir, "summary.html");
    await executeCommand(
      "node",
      [
        "--max-old-space-size=4096",
        "summarise.js",
        "--input-dir",
        sessionUnzippedDir,
        "--output",
        targetSummary,
      ],
      __dirname,
      sessionId,
    );

    // At this point summarise.js wrote directly to targetSummary (above). Confirm it exists.
    if (!fs.existsSync(targetSummary)) {
      throw new Error("summary.html was not generated by summarise.js");
    }
    const sourceContent = fs.readFileSync(targetSummary, "utf8");
    console.log(
      `✅ DIAGNOSTIC: Found summary.html, length: ${sourceContent.length} characters`,
    );

    // Update status: complete
    updateStatus(
      sessionId,
      "complete",
      "complete",
      "Processing completed successfully!",
      100,
      {
        summaryPath: targetSummary,
        downloadUrl: `/api/download/${sessionId}`,
      },
    );

    console.log(
      `✅ DIAGNOSTIC: Processing completed successfully for session ${sessionId}`,
    );

    // Clean up upload files after successful processing
    setTimeout(() => {
      if (fs.existsSync(uploadDir)) {
        fs.rmSync(uploadDir, { recursive: true });
      }
    }, 300000); // Clean up after 5 minutes
  } catch (error) {
    console.error("🚨 DIAGNOSTIC: Processing error:", error);
    updateStatus(
      sessionId,
      "error",
      "error",
      `Processing failed: ${error.message}`,
      0,
      { error: error.message },
    );
    // ensure we free up concurrency slot
    if (activeSessions.has(sessionId)) activeSessions.delete(sessionId);
  }
}

// Helper function to execute commands safely (no shell) and capture logs
function executeCommand(command, args = [], cwd = __dirname, sessionId = null) {
  return new Promise((resolve, reject) => {
    console.log(`DIAGNOSTIC: Spawning: ${command} ${args.join(" ")} in ${cwd}`);
    const proc = spawn(command, args, { cwd });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      console.log(`📋 DIAGNOSTIC: stdout: ${s}`);
      if (sessionId) appendSessionLog(sessionId, "stdout", s);
    });
    proc.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      console.log(`⚠️  DIAGNOSTIC: stderr: ${s}`);
      if (sessionId) appendSessionLog(sessionId, "stderr", s);
    });
    proc.on("error", (err) => {
      console.error(`❌ DIAGNOSTIC: Spawn error: ${err.message}`);
      if (sessionId) appendSessionLog(sessionId, "error", err.message);
      reject(err);
    });
    proc.on("close", (code) => {
      if (code === 0) {
        console.log(`✅ DIAGNOSTIC: Process exited 0: ${command}`);
        if (sessionId) appendSessionLog(sessionId, "exit", `exit code 0`);
        resolve({ stdout, stderr });
      } else {
        const err = new Error(`Process exited with code ${code}`);
        console.error(`❌ DIAGNOSTIC: ${err.message}`);
        if (sessionId) appendSessionLog(sessionId, "exit", `exit code ${code}`);
        reject({ error: err, stdout, stderr });
      }
    });
  });
}

// Append log lines into processingStatus for a session (bounded buffer)
function appendSessionLog(sessionId, stream, text) {
  try {
    const current = processingStatus.get(sessionId) || {};
    const logs = Array.isArray(current.logs) ? current.logs : [];
    const lines = String(text || "")
      .split(/\r?\n/)
      .filter(Boolean);
    for (const line of lines) {
      logs.push({ t: new Date().toISOString(), s: stream, m: line });
    }
    // keep last 1000 entries
    if (logs.length > 1000) logs.splice(0, logs.length - 1000);
    processingStatus.set(sessionId, { ...current, logs });
  } catch (e) {
    console.error("Failed to append session log", e);
  }
}

// Read the first N bytes of a file safely
function readFileHeader(filePath, length) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(length);
    const bytes = fs.readSync(fd, buf, 0, length, 0);
    return buf.slice(0, bytes);
  } finally {
    fs.closeSync(fd);
  }
}

// Helper function to update processing status
function updateStatus(sessionId, status, stage, message, progress, extra = {}) {
  const currentStatus = processingStatus.get(sessionId) || {};
  processingStatus.set(sessionId, {
    ...currentStatus,
    status,
    stage,
    message,
    progress,
    updatedAt: new Date(),
    ...extra,
  });
  console.log(
    `🔄 DIAGNOSTIC: Status update for ${sessionId}: ${status} - ${message}`,
  );
}

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: "File too large. Maximum size is 500MB." });
    }
  }
  // Return clearer 400 for fileFilter rejections
  if (
    error &&
    error.message &&
    error.message.indexOf("Unsupported file type") === 0
  ) {
    return res.status(400).json({ error: error.message });
  }
  console.error("🚨 Server error:", error);
  res.status(500).json({ error: "Internal server error" });
});

// Start server when run directly (allow tests to require the app without listening)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Newmanator server running at http://localhost:${PORT}`);
    console.log(`Upload directory: ${UPLOAD_DIR}`);
    console.log(`Results directory: ${RESULTS_DIR}`);
    console.log(`Maximum file size: 500MB`);
    console.log(
      `Uses your existing process-files.js and summarise.js pipeline`,
    );
  });
}

module.exports = app;
