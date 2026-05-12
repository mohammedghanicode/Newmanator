// Renderer process script for Newmanator UI

const selectedFiles = [];
let isProcessing = false;

const els = {
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  uploadBtn: document.getElementById("uploadBtn"),
  clearBtn: document.getElementById("clearBtn"),
  fileList: document.getElementById("fileList"),
  statusMessage: document.getElementById("statusMessage"),
  progressBar: document.getElementById("progressBar"),
  progressBarLabel: document.getElementById("progressBarLabel"),
  resultFrame: document.getElementById("resultFrame"),
  downloadSection: document.getElementById("downloadSection"),
  downloadBtn: document.getElementById("downloadBtn"),
  logsPanel: document.getElementById("logsPanel"),
  sessionIdDisplay: document.getElementById("sessionIdDisplay"),
};

function updateSelectionStatus() {
  const count = selectedFiles.length;
  els.sessionIdDisplay.textContent =
    count === 0 ? "None"
    : count === 1 ? "1 report queued"
    : `${count} reports queued`;
}

function updateControls() {
  const hasFiles = selectedFiles.length > 0;
  els.uploadBtn.disabled = !hasFiles || isProcessing;
  els.clearBtn.disabled = !hasFiles || isProcessing;
}

function formatFileList() {
  if (selectedFiles.length === 0) {
    els.fileList.classList.remove("has-files");
    els.fileList.innerHTML = "Awaiting files...";
    return;
  }

  els.fileList.classList.add("has-files");
  els.fileList.innerHTML = selectedFiles
    .map((file) => {
      const fileName = file.split("\\").pop().split("/").pop();
      const ext = fileName.split(".").pop().toLowerCase();
      const icon = ext === "zip" ? "📦" : "📄";
      return `
        <div class="file-item">
          <span class="file-name">${icon} ${fileName}</span>
        </div>
      `;
    })
    .join("");
}

function setProgress(percent, statusText) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  els.progressBar.style.width = `${value}%`;
  els.progressBarLabel.textContent = `${value}%`;
  els.statusMessage.textContent = statusText;
}

function appendLog(message, type = "info") {
  const line = document.createElement("div");
  line.textContent = message;
  line.style.whiteSpace = "pre-wrap";
  line.style.color = type === "error" ? "#f87171" : "#a5f3fc";
  els.logsPanel.appendChild(line);
  els.logsPanel.scrollTop = els.logsPanel.scrollHeight;
}

function resetLogs() {
  els.logsPanel.innerHTML = "";
}

function setResultPreview(summaryPath) {
  const fileUrl =
    summaryPath.startsWith("file://") ? summaryPath : (
      `file:///${summaryPath.replace(/\\/g, "/")}`
    );
  els.resultFrame.src = fileUrl;
}

function handleFileSelection(files) {
  selectedFiles.length = 0;
  for (const file of files) {
    const pathValue = file.path ?? file;
    if (!pathValue) continue;
    const ext = pathValue.split(".").pop().toLowerCase();
    if (["zip", "html"].includes(ext)) {
      selectedFiles.push(pathValue);
    }
  }
  formatFileList();
  updateSelectionStatus();
  updateControls();
}

function clearSelection() {
  selectedFiles.length = 0;
  formatFileList();
  updateSelectionStatus();
  updateControls();
  setProgress(0, "SYSTEM_READY");
  resetLogs();
  setResultPreview("about:blank");
  els.downloadSection.style.display = "none";
}

async function processFiles() {
  if (selectedFiles.length === 0 || isProcessing) return;
  isProcessing = true;
  updateControls();
  setProgress(5, "PROCESSING_FILES...");
  resetLogs();
  els.downloadSection.style.display = "none";

  try {
    const result = await window.electronAPI.processFiles(selectedFiles);
    if (result.success) {
      appendLog(`✅ Summary generated: ${result.summaryPath}`);
      setResultPreview(result.summaryPath);
      els.downloadSection.style.display = "block";
      setProgress(100, "COMPLETE");
    }
  } catch (error) {
    const message =
      error?.message ||
      (typeof error === "string" ? error : JSON.stringify(error));
    appendLog(`❌ ${message}`, "error");
    setProgress(0, "ERROR");
  } finally {
    isProcessing = false;
    updateControls();
  }
}

function addDropListeners() {
  els.dropZone.addEventListener("click", () => els.fileInput.click());

  els.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragover");
  });

  els.dropZone.addEventListener("dragleave", () => {
    els.dropZone.classList.remove("dragover");
  });

  els.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragover");
    handleFileSelection(Array.from(event.dataTransfer.files));
  });
}

function init() {
  addDropListeners();
  formatFileList();
  updateSelectionStatus();
  updateControls();

  els.fileInput.addEventListener("change", (event) => {
    handleFileSelection(Array.from(event.target.files));
    event.target.value = null;
  });
  els.uploadBtn.addEventListener("click", processFiles);
  els.clearBtn.addEventListener("click", clearSelection);
  els.downloadBtn.addEventListener("click", () =>
    window.electronAPI.openSummary(),
  );

  window.electronAPI.onProcessOutput((event, data) => {
    appendLog(data.toString(), "info");
  });
  window.electronAPI.onProcessError((event, data) => {
    appendLog(data.toString(), "error");
  });
}

init();
