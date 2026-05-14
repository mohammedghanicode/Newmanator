const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let mainWindow;

// Define base data path for user data
// In production, this ensures data is written to AppData
const baseDataPath =
  app.isPackaged ? app.getPath("userData") : path.join(__dirname, "..");

/**
 * Helper to get the correct path for scripts.
 * Since asar is set to false in package.json, the structure remains consistent
 * between development and production.
 */
const getScriptPath = (fileName) => {
  // We simply look one directory up from the electron folder where this file sits
  return path.join(__dirname, "..", fileName);
};

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
}

app.whenReady().then(() => {
  // Initialize data directories in the writable AppData location
  const dirs = ["uploads", "results", "unzipped"];
  dirs.forEach((dir) => {
    const dirPath = path.join(baseDataPath, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    }
  });

  createWindow();
});

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
  try {
    return new Promise((resolve, reject) => {
      // Get path to the PS1 script
      const psScriptPath = getScriptPath("run-reporter.ps1");

      // Determine the directory where scripts are located
      const scriptWorkDir = path.dirname(psScriptPath);

      // Build PowerShell command with proper array syntax
      const psArrayString =
        "@(" + filePaths.map((p) => `"${p}"`).join(", ") + ")";

      const psCommand = `& "${psScriptPath}" -InputPaths ${psArrayString}`;

      console.log("Executing PowerShell command:", psCommand);

      const args = [
        "-ExecutionPolicy",
        "Bypass",
        "-NoProfile",
        "-Command",
        psCommand,
      ];

      // Spawn PowerShell process
      // We no longer need NODE_PATH because node_modules are physically present
      const ps = spawn("powershell.exe", args, {
        cwd: scriptWorkDir,
        env: {
          ...process.env,
          BASE_DATA_PATH: baseDataPath,
        },
      });

      let stdout = "";
      let stderr = "";

      ps.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;
        mainWindow.webContents.send("process-output", output);
      });

      ps.stderr.on("data", (data) => {
        const error = data.toString();
        stderr += error;
        mainWindow.webContents.send("process-error", error);
      });

      ps.on("close", (code) => {
        if (code === 0) {
          const summaryPath = path.join(baseDataPath, "summary.html");
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
  } catch (error) {
    console.error("Error in process-files handler:", error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
});

// Handle opening summary
ipcMain.handle("open-summary", async () => {
  const summaryPath = path.join(baseDataPath, "summary.html");
  if (fs.existsSync(summaryPath)) {
    require("electron").shell.openPath(summaryPath);
    return true;
  }
  return false;
});
