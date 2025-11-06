⚡ Newmanator Web UI

Web interface for the Newmanator Newman report collation tool.

Setup Instructions
Copy the files to your Newmanator directory:

server.js - Express.js API server

package.json - Node.js dependencies

Copy the index.html from the web app to public/index.html

Install dependencies:

bash
npm install
Ensure your existing files are present:

process-files.js (your enhanced multi-file processor)

summarise.js (your enhanced version with collection name fix)

package.json with required dependencies (adm-zip, cheerio)

Start the server:

bash
npm start
# or for development with auto-restart:
npm run dev
Access the web UI:
Open http://localhost:3000 in your browser

Directory Structure
text
Newmanator/
├── server.js                 # Web server (NEW)</br>
├── package.json              # Dependencies (UPDATED)</br>
├── public/                   # Static web files (NEW)
│   └── index.html           # Web UI
├── process-files.js          # Your existing multi-file processor
├── summarise.js              # Your enhanced version with collection names
├── process-zip.js            # Your existing ZIP processor (still used by PS1)
├── run-reporter.ps1          # Your enhanced PowerShell script
├── uploads/                  # Temporary upload storage (auto-created)
└── results/                  # Processing results (auto-created)
API Endpoints
POST /api/upload - Upload files for processing

GET /api/status/:sessionId - Check processing status

GET /api/results/:sessionId - Get processing results

GET /api/download/:sessionId - Download summary.html

GET /api/events/:sessionId - Server-sent events for real-time updates

Features
Multi-file upload - Drag & drop .zip and .html files

Real-time progress - Live updates during processing

Proper collection names - Uses your enhanced summarise.js

Download results - Generated summary.html files

Clean UI - Professional interface matching your preferences

How It Works
Files uploaded through web UI → /uploads/[sessionId]/

Server calls your process-files.js with uploaded files

Server calls your summarise.js to generate summary

Generated summary.html moved to /results/[sessionId]/

User can view/download results through web UI

Temporary files cleaned up automatically

The web server integrates seamlessly with your existing PowerShell workflow and enhanced processing pipeline!