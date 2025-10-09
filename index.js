const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const cheerio = require("cheerio");
const nodemailer = require("nodemailer");

// STEP 1: Unzip all reports
function unzipAllInFolder(zipFolder, outputFolder) {
  fs.readdirSync(zipFolder).forEach((file) => {
    if (file.endsWith(".zip")) {
      const zip = new AdmZip(path.join(zipFolder, file));
      const dest = path.join(outputFolder, path.basename(file, ".zip"));
      zip.extractAllTo(dest, true);
      console.log(`Unzipped: ${file}`);
    }
  });
}

// STEP 2: Parse HTML summaries
function parseNewmanHtml(html) {
  const $ = cheerio.load(html);
  const summary = [];

  $(".summary-row").each((i, row) => {
    const label = $(row).find(".label").text().trim();
    const value = $(row).find(".value").text().trim();
    if (label && value) summary.push({ label, value });
  });

  return summary;
}

// STEP 3: Create email-friendly HTML
function createSummaryHtml(parsedSummaries) {
  return `
    <html>
    <body style="font-family: Arial;">
      <h1>🧪 Newman Test Summary</h1>
      ${parsedSummaries
        .map(
          (summary, i) => `
        <h2>Collection ${i + 1}</h2>
        <ul>
          ${summary
            .map((item) => `<li><b>${item.label}</b>: ${item.value}</li>`)
            .join("")}
        </ul>
      `
        )
        .join("")}
    </body>
    </html>
  `;
}

// STEP 4: Send the email
async function sendEmail(htmlContent) {
  const transporter = nodemailer.createTransport({
    host: "smtp.office365.com", // or 'smtp.gmail.com' for Gmail
    port: 587,
    secure: false,
    auth: {
      user: "YOUR_EMAIL@example.com",
      pass: "YOUR_PASSWORD",
    },
  });

  const info = await transporter.sendMail({
    from: '"Test Reporter" <YOUR_EMAIL@example.com>',
    to: "recipient@example.com",
    subject: "Automated Newman Test Results",
    html: htmlContent,
  });

  console.log("Email sent:", info.messageId);
}

// STEP 5: Main runner
async function run() {
  const zipFolder = "./zips";
  const outputFolder = "./unzipped";

  unzipAllInFolder(zipFolder, outputFolder);

  const summaries = [];
  fs.readdirSync(outputFolder).forEach((folder) => {
    const fullFolderPath = path.join(outputFolder, folder);
    const files = fs.readdirSync(fullFolderPath);
    const htmlFile = files.find((f) => f.endsWith(".html"));

    if (htmlFile) {
      const html = fs.readFileSync(
        path.join(fullFolderPath, htmlFile),
        "utf-8"
      );
      summaries.push(parseNewmanHtml(html));
    }
  });

  const summaryHtml = createSummaryHtml(summaries);
  await sendEmail(summaryHtml);
}

if (require.main === module) {
  run();
}

module.exports = {
  unzipAllInFolder,
  parseNewmanHtml,
  createSummaryHtml,
  sendEmail,
  run,
};
