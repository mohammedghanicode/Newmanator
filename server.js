const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
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
    const allowedTypes = [".zip", ".html"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported file type: ${ext}. Only .zip and .html files are allowed.`
        )
      );
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit (increased from 50MB)
  },
});

// Processing status tracking
const processingStatus = new Map();

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Serve main UI
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// File upload endpoint
app.post("/api/upload", upload.array("files", 20), (req, res) => {
  try {
    const sessionId = req.sessionId || uuidv4();
    const files = req.files;

    console.log(`🚀 DIAGNOSTIC: Starting processing for session ${sessionId}`);
    console.log(
      `📁 Files uploaded: ${files.map((f) => f.originalname).join(", ")}`
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

    // Start processing asynchronously
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
});

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

  console.log(`🔍 DIAGNOSTIC: Looking for results at: ${resultsPath}`);

  if (!fs.existsSync(resultsPath)) {
    return res.status(404).json({ error: "Results not found" });
  }

  const htmlContent = fs.readFileSync(resultsPath, "utf8");
  console.log(
    `📊 DIAGNOSTIC: Results found, length: ${htmlContent.length} characters`
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
    console.log(`🔧 DIAGNOSTIC: Processing files for session ${sessionId}`);
    console.log(`📁 Upload directory: ${uploadDir}`);
    console.log(
      `📋 Files to process: ${files.map((f) => f.originalname).join(", ")}`
    );

    // Update status: validation
    updateStatus(
      sessionId,
      "processing",
      "validation",
      "Validating uploaded files...",
      20
    );

    // Create results directory for this session
    const sessionResultsDir = path.join(RESULTS_DIR, sessionId);
    if (!fs.existsSync(sessionResultsDir)) {
      fs.mkdirSync(sessionResultsDir, { recursive: true });
    }
    console.log(`📁 Session results directory: ${sessionResultsDir}`);

    // Update status: processing
    updateStatus(
      sessionId,
      "processing",
      "processing",
      "Processing report files...",
      40
    );

    // Build file arguments for process-files.js
    const fileArgs = files.map((f) => path.join(uploadDir, f.originalname));
    console.log(`📋 File arguments: ${fileArgs}`);

    // Check if process-files.js exists
    const processFilesPath = path.join(__dirname, "process-files.js");
    if (!fs.existsSync(processFilesPath)) {
      throw new Error(`process-files.js not found at ${processFilesPath}`);
    }

    // Call process-files.js
    console.log(`🚀 DIAGNOSTIC: Calling process-files.js...`);
    const processCmd = `node process-files.js ${fileArgs.map((f) => `"${f}"`).join(" ")}`;
    console.log(`📋 Command: ${processCmd}`);
    await executeCommand(processCmd);

    // Update status: collation
    updateStatus(
      sessionId,
      "processing",
      "collation",
      "Collating reports into summary...",
      70
    );

    // Check if summarise.js exists
    const summarisePath = path.join(__dirname, "summarise.js");
    if (!fs.existsSync(summarisePath)) {
      throw new Error(`summarise.js not found at ${summarisePath}`);
    }

    // Call summarise.js
    console.log(`🚀 DIAGNOSTIC: Calling summarise.js...`);
    await executeCommand("node summarise.js");

    // Check if summary.html was generated
    const sourceSummary = path.join(__dirname, "summary.html");
    const targetSummary = path.join(sessionResultsDir, "summary.html");

    console.log(
      `🔍 DIAGNOSTIC: Looking for generated summary.html at: ${sourceSummary}`
    );
    if (fs.existsSync(sourceSummary)) {
      const sourceContent = fs.readFileSync(sourceSummary, "utf8");
      console.log(
        `✅ DIAGNOSTIC: Found summary.html, length: ${sourceContent.length} characters`
      );
      console.log(
        `🔄 DIAGNOSTIC: First 200 chars: ${sourceContent.substring(0, 200)}`
      );

      fs.copyFileSync(sourceSummary, targetSummary);
      console.log(`✅ DIAGNOSTIC: Copied to results directory`);
    } else {
      throw new Error(
        "summary.html was not generated by your existing pipeline"
      );
    }

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
      }
    );

    console.log(
      `✅ DIAGNOSTIC: Processing completed successfully for session ${sessionId}`
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
      { error: error.message }
    );
  }
}

// Helper function to execute shell commands with detailed logging
function executeCommand(command, cwd = __dirname) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 DIAGNOSTIC: Executing: ${command} in ${cwd}`);
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ DIAGNOSTIC: Command failed: ${command}`, error);
        reject(error);
        return;
      }
      console.log(`✅ DIAGNOSTIC: Command succeeded: ${command}`);
      if (stdout) console.log(`📋 DIAGNOSTIC: stdout: ${stdout}`);
      if (stderr) console.log(`⚠️  DIAGNOSTIC: stderr: ${stderr}`);
      resolve({ stdout, stderr });
    });
  });
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
    `🔄 DIAGNOSTIC: Status update for ${sessionId}: ${status} - ${message}`
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
  console.error("🚨 Server error:", error);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Newmanator server running at http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${UPLOAD_DIR}`);
  console.log(`📊 Results directory: ${RESULTS_DIR}`);
  console.log(`📦 Maximum file size: 500MB`);
  console.log(
    `💡 Uses your existing process-files.js and summarise.js pipeline`
  );
});

module.exports = app;
