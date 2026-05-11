// Consolidated frontend script for Newmanator
(function () {
  const els = {
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
    sessionIdDisplay: document.getElementById("sessionIdDisplay"),
    logsCard: document.getElementById("logsCard"),
    logsPanel: document.getElementById("logsPanel"),
  };

  let files = [];
  let currentSession = null;
  let sse = null;

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function renderFileList() {
    els.fileList.innerHTML = "";
    if (files.length === 0) {
      els.clearBtn.disabled = true;
      els.uploadBtn.disabled = true;
      els.dropZone.classList.remove("has-files");
      return;
    }
    els.clearBtn.disabled = false;
    els.uploadBtn.disabled = false;
    els.dropZone.classList.add("has-files");

    files.forEach((f, idx) => {
      const node = document.createElement("div");
      node.className = "file-item";
      node.innerHTML = `
        <div class="file-info">
          <div class="file-icon">${f.name.toLowerCase().endsWith(".zip") ? "📦" : "📄"}</div>
          <div class="file-details">
            <div class="file-name">${escapeHtml(f.name)}</div>
            <div class="file-size">${formatBytes(f.size)}</div>
          </div>
        </div>
      `;
      const btn = document.createElement("button");
      btn.className = "remove-btn";
      btn.innerText = "Remove";
      btn.onclick = () => {
        files.splice(idx, 1);
        renderFileList();
      };
      node.appendChild(btn);
      els.fileList.appendChild(node);
    });
  }

  function pushFiles(list) {
    for (const f of Array.from(list)) {
      const ext = f.name.split(".").pop().toLowerCase();
      if (["zip", "html", "htm"].includes(ext)) files.push(f);
    }
    renderFileList();
  }

  // Handlers
  els.dropZone.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", (e) => {
    pushFiles(e.target.files);
    els.fileInput.value = "";
  });
  els.dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.dropZone.classList.add("dragover");
  });
  els.dropZone.addEventListener("dragleave", () =>
    els.dropZone.classList.remove("dragover"),
  );
  els.dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    els.dropZone.classList.remove("dragover");
    pushFiles(e.dataTransfer.files);
  });
  els.clearBtn.addEventListener("click", () => {
    files = [];
    renderFileList();
  });

  els.uploadBtn.addEventListener("click", () => {
    if (files.length === 0) return;
    uploadFiles();
  });

  async function uploadFiles() {
    els.uploadBtn.disabled = true;
    els.clearBtn.disabled = true;
    els.progressSection.classList.add("visible");
    updateStatus("processing", "Uploading files...", 5);

    const fd = new FormData();
    for (const f of files) fd.append("files", f, f.name);

    // XHR for upload progress
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = 5 + (e.loaded / e.total) * 45; // map to 5-50
          updateStatus(
            "processing",
            `Uploading: ${Math.round((e.loaded / e.total) * 100)}%`,
            pct,
          );
        }
      };
      xhr.onerror = () => {
        updateStatus("error", "Upload failed (network)", 0);
        els.uploadBtn.disabled = false;
        els.clearBtn.disabled = false;
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText || "{}");
          currentSession = data.sessionId;
          if (els.sessionIdDisplay)
            els.sessionIdDisplay.innerText = currentSession || "-";
          updateStatus("processing", "Waiting for processing...", 50);
          connectSSE(currentSession);
        } else {
          console.error("Upload failed", xhr.status, xhr.responseText);
          let message = "Upload failed";
          try {
            const parsed = JSON.parse(xhr.responseText || "{}");
            message = parsed.error || parsed.message || message;
          } catch (e) {
            message = xhr.responseText || message;
          }
          updateStatus("error", message, 0);
          els.uploadBtn.disabled = false;
          els.clearBtn.disabled = false;
        }
      };
      xhr.send(fd);
    } catch (e) {
      updateStatus("error", e.message, 0);
      els.uploadBtn.disabled = false;
      els.clearBtn.disabled = false;
    }
  }

  function connectSSE(sessionId) {
    try {
      if (sse)
        try {
          sse.close();
        } catch (e) {}
      sse = new EventSource(`/api/events/${sessionId}`);
      sse.onmessage = (ev) => {
        try {
          const status = JSON.parse(ev.data);
          if (status.message)
            updateStatus(
              status.status === "error" ? "error"
              : status.status === "complete" ? "success"
              : "processing",
              status.message,
              status.progress || 0,
            );
          if (status.logs && Array.isArray(status.logs))
            renderLogs(status.logs);
          if (status.status === "complete") {
            loadResults(sessionId);
            try {
              sse.close();
            } catch (e) {}
          }
        } catch (e) {
          console.error("SSE parse", e);
        }
      };
      sse.onerror = (e) => {
        console.warn("SSE error", e);
      };
    } catch (e) {
      console.error("SSE open failed", e);
    }
  }

  function renderLogs(logs) {
    if (!els.logsPanel) return;
    els.logsCard.style.display = "block";
    const tail = logs.slice(-500);
    els.logsPanel.innerHTML = tail
      .map((l) => {
        const time = new Date(l.t).toLocaleTimeString();
        const color =
          l.s === "stderr" ? "#ffb4b4"
          : l.s === "error" ? "#ff9b9b"
          : l.s === "exit" ? "#a3e635"
          : "#cfe8ff";
        return `<div style="margin-bottom:4px;color:${color}"><span style="color:#8892a6;">[${time}]</span> ${escapeHtml(l.m)}</div>`;
      })
      .join("");
    els.logsPanel.scrollTop = els.logsPanel.scrollHeight;
  }

  async function loadResults(sessionId) {
    try {
      updateStatus("processing", "Fetching results...", 90);
      const r = await fetch(`/api/results/${sessionId}`);
      if (!r.ok) {
        updateStatus("error", "Failed to fetch results", 0);
        return;
      }
      const j = await r.json();
      if (j && j.html) {
        els.resultFrame.srcdoc = j.html;
        els.resultPreview.classList.add("visible");
        els.downloadSection.style.display = "block";
        els.downloadBtn.onclick = () => {
          window.location = `/api/download/${sessionId}`;
        };
        updateStatus("success", "Complete — summary available", 100);
      }
    } catch (e) {
      updateStatus("error", "Failed to load results: " + e.message, 0);
    } finally {
      els.uploadBtn.disabled = false;
      els.clearBtn.disabled = false;
    }
  }

  function updateStatus(state, message, progress) {
    els.statusMessage.innerText = message || "";
    els.statusMessage.className =
      "status-message " +
      (state === "error" ? "status-error"
      : state === "success" ? "status-success"
      : "status-processing");
    els.progressBar.style.width =
      Math.max(0, Math.min(100, progress || 0)) + "%";
    els.progressBar.innerText = Math.round(progress || 0) + "%";
  }

  // init
  renderFileList();
  updateStatus("processing", "Ready", 0);
})();
