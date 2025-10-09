⚡ Newmanator

> **Newmanator** — a smart, one-command tool for collating Newman test reports into a single, interactive **HTML summary**.

---

🧠 Overview

If you use **Postman + Newman** for API testing, you already know the pain of juggling multiple JSON or HTML reports.  
**Newmanator** takes care of that — automatically.

Just **run one PowerShell script**, pick your zipped Newman reports, — and a neat `summary.html` report opens right in your browser.

---

🚀 Features

- 🧩 **One-click automation** — run once, collate everything.
- 🗂️ **Zip support** — simply select a zip file of multiple Newman reports.
- 📊 **HTML summary output** — view results instantly in your browser.
- ⚙️ **No manual setup** — zero config required, just run and relax.
- 🧠 **Smart merge logic** — combines multiple collections and runs into one unified summary.

---

🖥️ How It Works

1. Run the PowerShell script:
   ```bash
   powershell
   ./run-reporter.ps1
   ```
2. Browse for the zip file containing the newman reports and click OK
3. A browser window will open containing the collated report
   ```

   ```

---

🧩 Installation

```bash
git clone https://github.com/mohammedghanicode/Newmanator.git
cd Newmanator
npm install
```

🧪 Usage
Combine multiple reports:

node index.js --input ./reports --output ./summary.json

| Flag        | Description                               |
| ----------- | ----------------------------------------- |
| `--input`   | Directory of Newman report files          |
| `--output`  | Output file path                          |
| `--format`  | Specify output type (`json`, `csv`, etc.) |
| `--verbose` | Print detailed process logs               |

🧰 Project Structure

Newmanator/
├── run-reporter.ps1 # Main entry point (PowerShell automation)
├── process-zip.js # Handles zip extraction and data merge
├── index.js # Collation and HTML generation logic
├── index.test.js # Tests (optional)
├── package.json # Dependencies and scripts
└── README.md # You're reading it :)

📦 Dependencies

[Node.js](https://nodejs.org/) >= 18 ```
[Newman](https://www.npmjs.com/package/newman) (for report generation)

🧑‍💻 Author

Mohammed Ghani
📧 Mo Ghani
🌐 [Github](https://github.com/mohammedghanicode)

🪪 License

MIT

💬 Contributing

Pull requests are welcome!
For major changes, please open an issue first to discuss what you’d like to change.

🌟 Future Roadmap

- Add HTML report output
- Add CI/CD integration examples
- Include Slack/Email notifications
- Build simple UI dashboard for visualization

❤️ Show some love

If you find this project useful, consider leaving a ⭐️ — it helps a ton!
