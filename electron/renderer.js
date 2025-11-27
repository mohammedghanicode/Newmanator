// Renderer process script for Newmanator UI

let selectedFiles = [];
let isProcessing = false;

const elements = {
  browseBtn: document.getElementById('browseBtn'),
  processBtn: document.getElementById('processBtn'),
  fileList: document.getElementById('fileList'),
  outputSection: document.getElementById('outputSection'),
  outputBox: document.getElementById('outputBox'),
  openSummaryBtn: document.getElementById('openSummaryBtn'),
  statusBadge: document.getElementById('statusBadge')
};

// Browse for files
elements.browseBtn.addEventListener('click', async () => {
  const files = await window.electronAPI.selectFiles();
  
  if (files && files.length > 0) {
    selectedFiles = files;
    renderFileList();
    elements.processBtn.disabled = false;
  }
});

// Process files
elements.processBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0 || isProcessing) return;
  
  isProcessing = true;
  elements.processBtn.disabled = true;
  elements.browseBtn.disabled = true;
  elements.openSummaryBtn.style.display = 'none';
  
  // Show spinner
  const spinner = elements.processBtn.querySelector('.spinner');
  spinner.style.display = 'inline-block';
  elements.processBtn.innerHTML = '<span class="spinner"></span> Processing...';
  
  // Show output section
  elements.outputSection.classList.add('visible');
  elements.outputBox.innerHTML = '';
  updateStatus('processing', 'Processing reports...');
  
  try {
    const result = await window.electronAPI.processFiles(selectedFiles);
    
    if (result.success) {
      appendOutput('✅ Processing completed successfully!', 'success');
      appendOutput(`📄 Summary generated at: ${result.summaryPath}`, 'info');
      updateStatus('success', 'Processing completed! ✅');
      elements.openSummaryBtn.style.display = 'inline-flex';
    }
  } catch (error) {
    appendOutput(`❌ Error: ${error.error}`, 'error');
    if (error.errorOutput) {
      appendOutput(error.errorOutput, 'error');
    }
    updateStatus('error', `Processing failed: ${error.error}`);
  } finally {
    isProcessing = false;
    elements.browseBtn.disabled = false;
    elements.processBtn.disabled = false;
    elements.processBtn.innerHTML = '⚡ Process Reports';
  }
});

// Open summary
elements.openSummaryBtn.addEventListener('click', async () => {
  await window.electronAPI.openSummary();
});

// Listen for real-time output
window.electronAPI.onProcessOutput((event, data) => {
  appendOutput(data, 'info');
});

window.electronAPI.onProcessError((event, data) => {
  appendOutput(data, 'error');
});

// Render file list
function renderFileList() {
  if (selectedFiles.length === 0) {
    elements.fileList.classList.remove('has-files');
    elements.fileList.innerHTML = `
      <div class="empty-state">
        📁 No files selected<br>
        <small>Click "Browse Files" to select reports</small>
      </div>
    `;
    return;
  }
  
  elements.fileList.classList.add('has-files');
  elements.fileList.innerHTML = selectedFiles.map(file => {
    const fileName = file.split('\\').pop().split('/').pop();
    const ext = fileName.split('.').pop().toLowerCase();
    const icon = ext === 'zip' ? '📦' : '📄';
    
    return `
      <div class="file-item">
        <span class="file-icon">${icon}</span>
        <span>${fileName}</span>
      </div>
    `;
  }).join('');
}

// Append output
function appendOutput(text, type = 'info') {
  const line = document.createElement('div');
  line.className = `output-line output-${type}`;
  line.textContent = text;
  elements.outputBox.appendChild(line);
  elements.outputBox.scrollTop = elements.outputBox.scrollHeight;
}

// Update status badge
function updateStatus(status, message) {
  elements.statusBadge.className = `status-badge status-${status}`;
  elements.statusBadge.textContent = message;
}

// Initial render
renderFileList();
