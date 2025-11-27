// app.js - Frontend JavaScript for Newmanator Web UI

let selectedFiles = [];
let currentSessionId = null;

const elements = {
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  fileList: document.getElementById("fileList"),
  clearBtn: document.getElementById("clearBtn"),
  uploadBtn: document.getElementById("uploadBtn"),
  progressSection: document.getElementById("progressSection"),
  statusMessage: document.getElementById("statusMessage"),
  progressBar: document.getElementById("progressBar"),
  resultPreview: document.getElementById("resultPreview"),
  resultFrame: document.getElementById("resultFrame"),
  downloadSection: document.getElementById("downloadSection"),
  downloadBtn: document.getElementById("downloadBtn"),
};

// Drop zone click handler
elements.dropZone.addEventListener("click", () => {
  elements.fileInput.click();
});

// File input change handler
elements.fileInput.addEventListener("change", (e) => {
  handleFiles(Array.from(e.target.files));
});

// Drag and drop handlers
elements.dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  elements.dropZone.classList.add("dragover");
});

elements.dropZone.addEventListener("dragleave", () => {
  elements.dropZone.classList.remove("dragover");
});

elements.dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  elements.dropZone.classList.remove("dragover");
  handleFiles(Array.from(e.dataTransfer.files));
});

// Clear files handler
elements.clearBtn.addEventListener("click", () => {
  selectedFiles = [];
  renderFileList();
  updateButtons();
});

// Upload handler
elements.uploadBtn.addEventListener("click", async () => {
  if (selectedFiles.length === 0) return;
  await uploadAndProcess();
});

// Download handler
elements.downloadBtn.addEventListener("click", () => {
  if (currentSessionId) {
    window.open(`/api/download/${currentSessionId}`, "_blank");
  }
});

// Handle file selection
function handleFiles(files) {
  const validFiles = files.filter((file) => {
    const ext = file.name.toLowerCase();
    return ext.endsWith(".zip") || ext.endsWith(".html");
  });

  if (validFiles.length === 0) {
    alert("Please select .zip or .html files only");
    return;
  }

  selectedFiles = [...selectedFiles, ...validFiles];
  renderFileList();
  updateButtons();
}

// Render file list
function renderFileList() {
  if (selectedFiles.length === 0) {
    elements.fileList.innerHTML = "";
    elements.dropZone.classList.remove("has-files");
    return;
  }

  elements.dropZone.classList.add("has-files");

  elements.fileList.innerHTML = selectedFiles
    .map((file, index) => {
      const icon = file.name.toLowerCase().endsWith(".zip") ? "📦" : "📄";
      const size = formatFileSize(file.size);

      return `
      <div class="file-item">
        <div class="file-info">
          <span class="file-icon">${icon}</span>
          <div class="file-details">
            <div class="file-name">${escapeHtml(file.name)}</div>
            <div class="file-size">${size}</div>
          </div>
        </div>
        <button class="remove-btn" onclick="removeFile(${index})">Remove</button>
      </div>
    `;
    })
    .join("");
}

// Remove file from list
function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
  updateButtons();
}

// Update button states
function updateButtons() {
  const hasFiles = selectedFiles.length > 0;
  elements.clearBtn.disabled = !hasFiles;
  elements.uploadBtn.disabled = !hasFiles;
}

// Upload and process files
async function uploadAndProcess() {
  try {
    // Disable buttons
    elements.uploadBtn.disabled = true;
    elements.clearBtn.disabled = true;

    // Show progress section
    elements.progressSection.classList.add("visible");
    elements.resultPreview.classList.remove("visible");
    elements.downloadSection.style.display = "none";

    updateStatus("processing", "Uploading files...", 10);

    // Create FormData
    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    // Upload files
    const uploadResponse = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error("Upload failed");
    }

    const uploadData = await uploadResponse.json();
    currentSessionId = uploadData.sessionId;

    updateStatus("processing", "Processing reports...", 30);

    // Poll for status updates
    await pollStatus(currentSessionId);
  } catch (error) {
    console.error("Error:", error);
    updateStatus("error", `Error: ${error.message}`, 0);
    elements.uploadBtn.disabled = false;
    elements.clearBtn.disabled = false;
  }
}

// Poll processing status
async function pollStatus(sessionId) {
  const maxAttempts = 60; // 2 minutes max
  let attempts = 0;

  const poll = async () => {
    try {
      const response = await fetch(`/api/status/${sessionId}`);
      if (!response.ok) throw new Error("Status check failed");

      const status = await response.json();

      updateStatus(status.status, status.message, status.progress);

      if (status.status === "complete") {
        // Load results
        await loadResults(sessionId);
        elements.uploadBtn.disabled = false;
        elements.clearBtn.disabled = false;
        return;
      }

      if (status.status === "error") {
        elements.uploadBtn.disabled = false;
        elements.clearBtn.disabled = false;
        return;
      }

      // Continue polling
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(poll, 2000);
      } else {
        throw new Error("Processing timeout");
      }
    } catch (error) {
      updateStatus("error", `Error: ${error.message}`, 0);
      elements.uploadBtn.disabled = false;
      elements.clearBtn.disabled = false;
    }
  };

  poll();
}

// Load and display results
async function loadResults(sessionId) {
  try {
    const response = await fetch(`/api/results/${sessionId}`);
    if (!response.ok) throw new Error("Failed to load results");

    const data = await response.json();

    // Create a blob URL for the iframe
    const blob = new Blob([data.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    elements.resultFrame.src = url;
    elements.resultPreview.classList.add("visible");
    elements.downloadSection.style.display = "block";

    updateStatus(
      "success",
      "✅ Processing completed! View results below.",
      100
    );
  } catch (error) {
    console.error("Error loading results:", error);
    updateStatus("error", `Failed to load results: ${error.message}`, 0);
  }
}

// Update status display
function updateStatus(status, message, progress) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message status-${status}`;
  elements.progressBar.style.width = `${progress}%`;
  elements.progressBar.textContent = `${progress}%`;
}

// Helper functions
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Make removeFile global
window.removeFile = removeFile;

// Initialize
updateButtons();
