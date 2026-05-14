# 🚀 Getting Started with Newmanator

A complete setup and installation guide for Newmanator.

---

## 📋 Prerequisites

Before installing Newmanator, ensure you have:

- **Windows 10/11** or **macOS/Linux**
- **Node.js** v18+ ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **PowerShell 5.1+** (Windows)
- **Newman** installed globally (optional, for generating reports)
  ```bash
  npm install -g newman
  ```

### Check Your Setup

```bash
# Verify Node.js
node --version

# Verify npm
npm --version

# Verify PowerShell (Windows only)
powershell -Command "Write-Host $PSVersionTable.PSVersion"
```

---

## 💾 Installation

### Method 1: From Source (Development)

1. **Clone the Repository**

   ```bash
   git clone https://github.com/mohammedghanicode/Newmanator.git
   cd Newmanator
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Run the App**

   ```bash
   # Desktop app
   npm start

   # Web version
   npm run start:web

   # PowerShell script
   npm run powershell
   ```

### Method 2: Pre-Built Executable (Windows)

1. **Download the Installer**
   - Get `Newmanator-Setup.exe` from [Releases](https://github.com/mohammedghanicode/Newmanator/releases)

2. **Run the Installer**
   - Double-click `Newmanator-Setup.exe`
   - Follow the installation wizard

3. **Launch Newmanator**
   - Click the desktop shortcut
   - Or find it in Start Menu: `Newmanator`

---

## 🏗️ Project Structure

```
Newmanator/
├── electron/                    # Desktop app files
│   ├── electron-main.js        # Main Electron process
│   ├── preload.js              # Security bridge
│   ├── renderer.js             # UI logic
│   └── index.html              # Desktop UI
├── public/                      # Web UI files
│   ├── app.js                  # Web client logic
│   └── index.html              # Web UI
├── test/                        # Test files
│   └── upload.test.js
├── process-files.js             # File extraction & processing
├── process-zip.js              # Zip handling
├── summarise.js                # Report aggregation
├── index.js                     # Core collation logic
├── server.js                    # Web server (Express)
├── run-reporter.ps1            # PowerShell automation
├── package.json                # Dependencies & scripts
└── README.md                   # Project overview
```

---

## 🎯 Quick Start Paths

### I want the desktop app

```bash
npm install
npm start
```

→ Opens Newmanator desktop interface

### I want the web version

```bash
npm install
npm run start:web
```

→ Opens http://localhost:3000

### I want PowerShell automation

```bash
npm install
npm run powershell
```

→ Opens file browser to select reports

### I want a standalone .exe

```bash
npm install
npm run build:win
```

→ Generates installer in `dist/` folder

---

## 🔧 Configuration

### Default Data Directories

Newmanator creates these folders automatically:

- **Development:**

  ```
  Newmanator/
  ├── unzipped/     # Extracted reports
  ├── results/      # Processing results
  └── uploads/      # Uploaded files
  ```

- **Production (Packaged App):**
  ```
  C:\Users\{Username}\AppData\Roaming\Newmanator\
  ├── unzipped/
  ├── results/
  └── uploads/
  ```

### Custom Data Path

Set a custom path for data storage:

```bash
# Windows (PowerShell)
$env:BASE_DATA_PATH = "D:\MyReports"
npm start

# Linux/Mac
export BASE_DATA_PATH=/home/user/myreports
npm start
```

---

## 📊 Running Your First Report

### Step 1: Generate a Newman Report

```bash
# If you don't have Postman collections yet, create a test report manually
newman run https://www.postman.com/collections/your-collection-id \
  --environment environment.json \
  --reporters json,html \
  --reporter-html-export report.html \
  --reporter-json-export report.json
```

### Step 2: Package Reports (Optional)

If you have multiple reports, zip them:

```bash
# Windows
Compress-Archive -Path report-1.html, report-2.html -DestinationPath reports.zip

# Linux/Mac
zip reports.zip report-1.html report-2.html
```

### Step 3: Open Newmanator

```bash
npm start
```

### Step 4: Process Reports

1. Drag `.zip` or `.html` files into the drop zone
2. Click **Process_Reports**
3. View the summary in the preview area

---

## 🧪 Testing Your Setup

### Run Unit Tests

```bash
npm test
```

### Run Upload Tests

```bash
npm test -- test/upload.test.js
```

### Manual Testing

1. **Desktop App:**

   ```bash
   npm start
   # Upload a test report and verify summary generates
   ```

2. **Web App:**
   ```bash
   npm run start:web
   # Navigate to http://localhost:3000 and upload a test report
   ```

---

## 📦 Building for Distribution

### Windows Executable

```bash
npm run build:win
```

Creates in `dist/`:

- `Newmanator-Setup.exe` — Installer
- `Newmanator.exe` — Portable version

### All Platforms

```bash
npm run build
```

Supports Windows, macOS, and Linux builds.

---

## 🐛 Troubleshooting Installation

### "npm: command not found"

- **Solution:** Install Node.js from https://nodejs.org/
- Restart your terminal after installation

### "electron: command not found"

- **Solution:**
  ```bash
  npm install -g electron
  npm install
  ```

### "PowerShell execution policy error"

- **Solution:**
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

### Port 3000 already in use (web version)

- **Solution:**
  ```bash
  # Change port
  PORT=3001 npm run start:web
  ```

### Module not found errors

- **Solution:**
  ```bash
  # Clear and reinstall
  rm -r node_modules package-lock.json
  npm install
  ```

---

## 🌐 Environment Setup for CI/CD

### GitHub Actions Example

```yaml
name: Test & Generate Report

on: [push]

jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "18"

      - name: Run Newman tests
        run: |
          npm install -g newman
          newman run collection.json --reporters json,html

      - name: Install Newmanator
        run: npm install

      - name: Generate summary
        run: node index.js --input ./results --output ./summary.html

      - name: Upload report
        uses: actions/upload-artifact@v3
        with:
          name: summary-report
          path: summary.html
```

---

## 🔄 Updating Newmanator

### From Source

```bash
cd Newmanator
git pull origin main
npm install
```

### Pre-Built Executable

- Download the latest version from Releases
- Uninstall the old version
- Run the new installer

---

## 📚 Next Steps

1. ✅ **Installation Complete** — You've set up Newmanator
2. 📖 **Read the User Guide** — See [USER_GUIDE.md](USER_GUIDE.md)
3. 🚀 **Run Your First Report** — Follow the "Running Your First Report" section above
4. ⚙️ **Explore Advanced Features** — Check out the [README.md](README.md)
5. 🔗 **Integrate with CI/CD** — Automate report generation

---

## 💡 Pro Tips

- **Keyboard Shortcut:** Press `Ctrl+Shift+I` in the desktop app to open DevTools (dev mode)
- **Batch Processing:** Zip 100+ reports together for bulk collation
- **Scheduled Runs:** Use Windows Task Scheduler to run reports on a schedule
- **Network Shares:** Store reports on network drives and process remotely

---

## 🤝 Getting Help

- **FAQ** — See [USER_GUIDE.md](USER_GUIDE.md#troubleshooting)
- **GitHub Issues** — https://github.com/mohammedghanicode/Newmanator/issues
- **Documentation** — Full docs in this repository

---

**Ready? Start with `npm install` and `npm start`! ⚡**
