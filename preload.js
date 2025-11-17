const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  selectFiles: () => ipcRenderer.invoke('select-files'),
  processFiles: (filePaths) => ipcRenderer.invoke('process-files', filePaths),
  openSummary: () => ipcRenderer.invoke('open-summary'),
  onProcessOutput: (callback) => ipcRenderer.on('process-output', callback),
  onProcessError: (callback) => ipcRenderer.on('process-error', callback)
});
