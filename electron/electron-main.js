const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "assets", "icon.png"),
    title: "⚡ Newmanator",
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle file selection
ipcMain.handle("select-files", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Newman Reports", extensions: ["zip", "html"] },
      { name: "ZIP Files", extensions: ["zip"] },
      { name: "HTML Files", extensions: ["html"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths;
});

// Handle PowerShell execution
ipcMain.handle("process-files", async (event, filePaths) => {
  return new Promise((resolve, reject) => {
    // Build PowerShell command with proper array syntax
    // PowerShell syntax: -InputPaths @("file1", "file2", "file3")
    const psArrayString =
      "@(" + filePaths.map((p) => `"${p}"`).join(", ") + ")";

    // Build the full command as a single string
    const psCommand = `& "${path.join(__dirname, "run-reporter.ps1")}" -InputPaths ${psArrayString}`;

    console.log("Executing PowerShell command:", psCommand);

    const args = [
      "-ExecutionPolicy",
      "Bypass",
      "-NoProfile",
      "-Command",
      psCommand,
    ];

    // Spawn PowerShell process
    const ps = spawn("powershell.exe", args, {
      cwd: __dirname,
    });

    let stdout = "";
    let stderr = "";

    // Capture output
    ps.stdout.on("data", (data) => {
      const output = data.toString();
      stdout += output;
      // Send real-time updates to renderer
      mainWindow.webContents.send("process-output", output);
    });

    ps.stderr.on("data", (data) => {
      const error = data.toString();
      stderr += error;
      mainWindow.webContents.send("process-error", error);
    });

    ps.on("close", (code) => {
      if (code === 0) {
        // Check if summary.html exists
        const summaryPath = path.join(__dirname, "summary.html");
        if (fs.existsSync(summaryPath)) {
          resolve({
            success: true,
            summaryPath: summaryPath,
            output: stdout,
          });
        } else {
          reject({
            success: false,
            error: "summary.html was not generated",
            output: stdout,
            errorOutput: stderr,
          });
        }
      } else {
        reject({
          success: false,
          error: `PowerShell exited with code ${code}`,
          output: stdout,
          errorOutput: stderr,
        });
      }
    });

    ps.on("error", (error) => {
      reject({
        success: false,
        error: error.message,
      });
    });
  });
});

// Handle opening summary
ipcMain.handle("open-summary", async () => {
  const summaryPath = path.join(__dirname, "summary.html");
  if (fs.existsSync(summaryPath)) {
    require("electron").shell.openPath(summaryPath);
    return true;
  }
  return false;
});
