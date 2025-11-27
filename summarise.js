// summarise.js — fast, memory-safe, accurate counts + FAILED requests only (grouped, red) + request/URL context
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

// Turn this on when JSON isn't available and you want HTML-parsed details.
const ENABLE_HTML_DETAILS_FALLBACK = true;
const HTML_DETAILS_MAX_ROWS = 5000; // cap HTML-parsed rows to keep memory stable
const JSON_DETAILS_MAX_ROWS = 20000; // cap JSON rows just in case

// Exclude patterns: tests/messages that should be ignored entirely
const EXCLUDE_PATTERNS = [/Response time is below threshold/i];

/* ============================== helpers ============================== */
function toNumber(val, fallback = 0) {
  if (val == null) return fallback;
  const m = String(val).replace(/,/g, "").match(/-?\d+/);
  return m ? Number(m[0]) : fallback;
}
function cleanKey(label) {
  return String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
function getFirstMetric(obj, keys, fallback = "-") {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== "") return obj[k];
  }
  return fallback;
}
function getFirstMetricNumber(obj, keys, fallback = 0) {
  return toNumber(getFirstMetric(obj, keys, null), fallback);
}
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Secret redaction: JWT/Bearer/API keys & long tokens */
function redactSensitive(s) {
  if (!s) return s;
  let out = String(s);

  // Bearer tokens / JWTs
  out = out.replace(
    /\bBearer\s+[A-Za-z0-9\-\._]+\b/gi,
    "Bearer ***redacted***"
  );
  out = out.replace(
    /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g,
    "***redacted.jwt***"
  );

  // Generic long base64ish tokens (avoid eating normal words)
  out = out.replace(/\b[A-Za-z0-9+/_-]{32,}\b/g, "***redacted***");

  // Common key names
  out = out.replace(/(api[-_\s]?key\s*[:=]\s*)([^\s]+)/gi, "$1***redacted***");
  out = out.replace(/(authorization\s*[:=]\s*)([^\s]+)/gi, "$1***redacted***");

  return out;
}

/* Noise filters: drop obvious header/metadata rows that aren’t failed assertions */
const NOISE_ASSERTION_NAMES = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "connection",
  "content-length",
  "content-type",
  "cookie",
  "date",
  "host",
  "pragma",
  "referer",
  "sec-ch-ua",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "user-agent",
  "postman-token",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-powered-by",
  "authorization",
  "x-auth-token",
  "x-correlation-id",
]);
const NOISE_MESSAGE_REGEXES = [
  /^\s*$/, // empty
  /^[A-Za-z\-]+:\s?.*$/, // "Header-Name: value"
  /^Bearer\s+[A-Za-z0-9\-\._]+$/i, // bearer token only
  /^[A-Za-z0-9+/_-]{32,}$/, // just a long token/blob
];
function isNoiseRow(test, message) {
  const t = String(test || "").trim();
  const m = String(message || "").trim();

  // Exclude any test/message that matches configured exclude patterns
  for (const rx of EXCLUDE_PATTERNS) {
    if (rx.test(t) || rx.test(m)) {
      return true;
    }
  }

  // Known noise: header/assertion names
  if (NOISE_ASSERTION_NAMES.has(t.toLowerCase())) {
    return true;
  }

  // Noise by message regexes
  for (const rx of NOISE_MESSAGE_REGEXES) {
    if (rx.test(m)) {
      return true;
    }
  }

  return false;
}

/* ======================== 1) find report.html files ======================== */
function findAllReports(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findAllReports(fullPath, found);
    } else if (file.toLowerCase() === "report.html") {
      found.push(fullPath);
    }
  }
  return found;
}

/* ================== 2) parse KPI + fallback failed from tables ============== */
function parseHtmlSummary(html, collectionName) {
  const $ = cheerio.load(html);
  const summary = { collectionName };

  // Primary: KPI cards
  $(".card-body").each((i, el) => {
    const label = $(el).find("h6.text-uppercase").text().trim();
    // Try both display-1 and display-4 classes (different Newman versions)
    let value = $(el).find("h1.display-1").text().trim();
    if (!value) {
      value = $(el).find("h1.display-4").text().trim();
    }
    if (label && value) {
      const key = cleanKey(label);
      summary[key] = value;
    }
  });

  // Fallback: sum Failed column across tables
  const failedFromTable = sumFailedFromTables($);
  if (failedFromTable != null) {
    const failedKpiNum = getFirstMetricNumber(
      summary,
      ["total_failed_tests", "failed_tests", "failed"],
      null
    );
    if (failedKpiNum === null || failedKpiNum === 0) {
      summary.total_failed_tests = String(failedFromTable);
    }
  }

  return summary;
}

// Sum the "Failed" column for any table with a header cell containing "Failed"
function sumFailedFromTables($) {
  const tables = $("table");
  let bestSum = null;
  tables.each((_, tbl) => {
    const $tbl = $(tbl);
    const headers = [];
    $tbl.find("thead tr th, thead tr td").each((i, th) => {
      headers.push($(th).text().trim().toLowerCase());
    });
    if (headers.length === 0) return;

    const failedIdx = headers.findIndex((h) => /\bfailed?\b/i.test(h));
    if (failedIdx === -1) return;

    let sum = 0;
    let rows = 0;
    $tbl.find("tbody tr").each((__, tr) => {
      const $cells = $(tr).find("td,th");
      if ($cells.length === 0) return;
      const cell = $cells.eq(failedIdx);
      if (cell && cell.length) {
        const n = toNumber(cell.text(), 0);
        if (!Number.isNaN(n)) {
          sum += n;
          rows++;
        }
      }
    });

    if (rows > 0 && sum >= 0) {
      if (bestSum == null || sum > bestSum) bestSum = sum;
    }
  });
  return bestSum;
}

/* ==================== 3) parse JSON failure details (SoT) =================== */
function parseFailedTests(reportJson) {
  const failedTests = [];
  if (!reportJson?.run?.executions) return failedTests;

  for (const exec of reportJson.run.executions) {
    const requestName = exec.item?.name || "Unknown request";
    for (const assertion of exec.assertions || []) {
      if (assertion && assertion.error) {
        failedTests.push({
          request: requestName,
          test: assertion.assertion,
          message: assertion.error.message,
        });
      }
    }
  }
  return failedTests.slice(0, JSON_DETAILS_MAX_ROWS);
}

/* ======== 3b) HTML failure-details extraction (broad, filtered, deduped) ======== */
/* NEW: infer request name + URL from surrounding headings/blocks when table lacks them */
function parseFailureDetailsFromHtml(html) {
  const $ = cheerio.load(html);
  const out = [];
  const seen = new Set();
  let added = 0;

  // Pass 0: parse card-based failures under the Failed tab
  const cardAnchors = $('#pills-failed .card-header a[id^="fails-"]');
  const hasCardFailures = cardAnchors.length > 0;
  cardAnchors.each((_, a) => {
    if (added >= HTML_DETAILS_MAX_ROWS) return false;
    const $a = $(a);
    const title = $a.text().trim().replace(/\s+/g, " ");
    const id = $a.attr("id");

    // request title: everything after the first two segments (Iteration and ErrorType)
    const parts = title
      .split(" - ")
      .map((p) => p.trim())
      .filter(Boolean);
    let request =
      parts.length >= 3 ?
        parts.slice(2).join(" - ")
      : parts[parts.length - 1] || "Unknown request";

    // find the corresponding card body
    const $card = $a.closest(".card");
    const $body = $card.find(".card-body").first();

    // Test name appears as <h5><strong>Failed Test:</strong> <name></h5>
    let test = $body
      .find("h5")
      .first()
      .text()
      .replace(/^\s*Failed\s*Test:\s*/i, "")
      .trim();

    // Message in <pre><code>
    let message = $body.find("pre code").first().text().trim();

    if (!test && !message) return; // skip empty
    if (isNoiseRow(test, message)) return;

    test = redactSensitive(test);
    message = redactSensitive(message);

    const key = `${request}||${test}||${message}`;
    if (seen.has(key)) return;
    seen.add(key);

    out.push({ request, test, message, href: id ? `#${id}` : null });
    added++;
  });

  // Helper: find first matching header index
  function findHeader(arr, keys) {
    for (let i = 0; i < arr.length; i++) {
      const h = arr[i];
      for (const k of keys) {
        if (h.includes(k)) return i;
      }
    }
    return -1;
  }

  function grabHeaders($table) {
    let $headCells = $table.find("thead tr").first().find("th,td");
    let useBodyHeader = false;

    if ($headCells.length === 0) {
      const $firstBodyRow = $table.find("tbody tr").first();
      $headCells = $firstBodyRow.find("th,td");
      useBodyHeader = $headCells.length > 0;
    }
    if ($headCells.length === 0) return { headers: [], useBodyHeader: false };

    const headers = $headCells
      .map((i, th) => $(th).text().trim().replace(/\s+/g, " ").toLowerCase())
      .get();

    return { headers, useBodyHeader };
  }

  // NEW: find nearest request context (heading like "Iteration: 1 - Get All" and/or URL)
  function getContextInfo($table) {
    let req = null,
      url = null;

    const sniff = (el) => {
      const t = $(el).text().trim();
      if (!t) return;
      if (!req) {
        const m = t.match(/iteration\s*:\s*\d+\s*-\s*(.+)$/i);
        if (m) req = m[1].trim();
      }
      if (
        !req &&
        t.length <= 120 &&
        /\b(get|post|put|delete|patch)\b/i.test(t) &&
        /\/[A-Za-z0-9/_\-?&=%.:]+/.test(t)
      ) {
        req = t.trim();
      }
      if (!url) {
        const u = t.match(/\bhttps?:\/\/[^\s'"]+/i);
        if (u) url = u[0];
      }
    };

    // look at a few previous siblings
    let node = $table.prev(),
      steps = 0;
    while (node && node.length && steps < 12 && (!req || !url)) {
      sniff(node);
      node = node.prev();
      steps++;
    }

    // look up parents and their previous siblings
    let parent = $table.parent(),
      depth = 0;
    while (parent && parent.length && depth < 5 && (!req || !url)) {
      sniff(parent);
      let ps = parent.prev(),
        psteps = 0;
      while (ps && ps.length && psteps < 6 && (!req || !url)) {
        sniff(ps);
        ps = ps.prev();
        psteps++;
      }
      parent = parent.parent();
      depth++;
    }

    return { req, url };
  }

  const skipTableFallback = hasCardFailures;
  // Pass A: scope to sections whose heading text mentions "Failure"/"Assertion"
  if (!skipTableFallback) {
    $("h1,h2,h3,h4,h5,h6").each((_, h) => {
      if (added >= HTML_DETAILS_MAX_ROWS) return false;
      const title = $(h).text().toLowerCase();
      if (!/fail|assertion/i.test(title)) return;

      let node = $(h).next();
      while (node && node.length && !node.is("h1,h2,h3,h4,h5,h6")) {
        if (node.is("table")) {
          harvestTable(node);
        } else {
          node.find("table").each((__, t) => harvestTable($(t)));
        }
        if (added >= HTML_DETAILS_MAX_ROWS) break;
        node = node.next();
      }
    });

    // Pass B: fallback over all tables (in case headings aren’t reliable)
    $("table").each((_, tbl) => {
      if (added >= HTML_DETAILS_MAX_ROWS) return false;
      harvestTable($(tbl));
    });
  }

  return out;

  function harvestTable($tbl) {
    if (added >= HTML_DETAILS_MAX_ROWS) return;

    const { headers, useBodyHeader } = grabHeaders($tbl);
    if (headers.length === 0) return;
    // Skip generic Name/Value tables (avoid grouping by header names)
    const isNameValueTable =
      headers.length === 2 &&
      /^(name|key)$/i.test(headers[0]) &&
      /^value$/i.test(headers[1]);
    if (isNameValueTable) return;

    // Broad header vocab
    const idx = {
      request: findHeader(headers, [
        "request",
        "endpoint",
        "url",
        "item",
        "request name",
        "api",
        "path",
      ]),
      test: findHeader(headers, [
        "assertion",
        "test",
        "test name",
        "check",
        "rule",
      ]),
      message: findHeader(headers, [
        "error",
        "message",
        "detail",
        "details",
        "reason",
        "failure",
        "error message",
      ]),
      failed: findHeader(headers, ["failed", "fails"]),
    };

    // If we don’t have both test & message, infer 2-col [Assertion | Message] only if headers look like failures
    if (idx.test === -1 || idx.message === -1) {
      const hasAssertLike = headers.some((h) =>
        /assertion|test|check|rule/i.test(h)
      );
      const hasMsgLike = headers.some((h) =>
        /error|message|detail|details|reason|failure/i.test(h)
      );
      if (headers.length === 2 && (hasAssertLike || hasMsgLike)) {
        idx.test = 0;
        idx.message = 1;
      } else {
        return; // not a recognizable failures table
      }
    }

    // NEW: infer surrounding request name / URL once per table
    const ctx = getContextInfo($tbl);
    const ctxReq = ctx.req ? ctx.req : null;
    const ctxUrl = ctx.url ? ctx.url : null;

    const $rows = $tbl.find("tbody tr");
    let startAt = 0;
    if (useBodyHeader && $rows.length > 0) startAt = 1;

    for (let r = startAt; r < $rows.length; r++) {
      if (added >= HTML_DETAILS_MAX_ROWS) break;
      const $tr = $rows.eq(r);
      const $cells = $tr.find("td,th");
      if ($cells.length === 0) continue;

      // Skip rows explicitly marked as 0 failed
      if (idx.failed !== -1 && idx.failed < $cells.length) {
        const txt = $cells.eq(idx.failed).text().trim().replace(/,/g, "");
        const num = parseInt(txt.match(/-?\d+/)?.[0] || "0", 10);
        if (!Number.isNaN(num) && num === 0) continue;
      }

      // Prefer explicit Request column; else use inferred context
      let request =
        idx.request !== -1 && idx.request < $cells.length ?
          $cells.eq(idx.request).text().trim()
        : ctxReq || "Unknown request";

      if (ctxUrl && !/https?:\/\//i.test(request)) {
        request = `${request} — ${ctxUrl}`;
      }

      let test =
        idx.test !== -1 && idx.test < $cells.length ?
          $cells.eq(idx.test).text().trim()
        : "Unknown assertion";

      let message =
        idx.message !== -1 && idx.message < $cells.length ?
          $cells.eq(idx.message).text().trim()
        : "Failed";

      // Filter noise + redact
      if (!test && !message) continue;
      if (isNoiseRow(test, message)) continue;
      test = redactSensitive(test);
      message = redactSensitive(message);

      const key = `${request}||${test}||${message}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({ request, test, message, href: null });
      added++;
    }
  }
}

/* ========== 4) Build HTML: overview table + FAILED requests only (grouped) ========== */
function createSummaryHtml(collections) {
  // Summary table at top (all collections)
  const showSkipped = collections.some(
    (c) =>
      toNumber(
        getFirstMetric(
          c,
          ["total_skipped_tests", "skipped_tests", "skipped"],
          "0"
        ),
        0
      ) > 0
  );
  const rowsHtml = collections
    .map((col) => {
      const iterations = getFirstMetric(col, ["total_iterations"], "-");
      const assertions = getFirstMetric(col, ["total_assertions"], "-");
      const failedStr = getFirstMetric(
        col,
        ["total_failed_tests", "failed_tests", "failed"],
        null
      );
      const failed =
        failedStr != null ? toNumber(failedStr, 0)
        : Array.isArray(col.failures) ? col.failures.length
        : 0;
      const skipped = getFirstMetric(
        col,
        ["total_skipped_tests", "skipped_tests", "skipped"],
        "0"
      );

      col.__failed_normalized = failed;
      const skippedCell = showSkipped ? `<td>${escapeHtml(skipped)}</td>` : "";
      return `
      <tr>
        <td>${escapeHtml(col.collectionName)}</td>
        <td>${escapeHtml(assertions)}</td>
        <td class="fail">${failed}</td>
        ${skippedCell}
      </tr>
    `;
    })
    .join("");

  const summaryTable = `
    <h1>Newman Test Results Summary</h1>
    <table>
      <tr>
        <th>Collection</th>
        <th>Assertions</th>
        <th>Failed</th>
        ${showSkipped ? "<th>Skipped</th>" : ""}
      </tr>
      ${rowsHtml}
    </table>
  `;

  // --- moved: define renderFailedRequests before it's used ---
  function renderFailedRequests(list, hrefBase) {
    if (!list || list.length === 0) {
      return `<div class="note">No detailed assertion rows found for failed requests.</div>`;
    }

    // request -> Map(test||msg -> { test, message, count }) and per-request anchor
    const byReq = new Map();
    const reqHref = new Map();
    for (const row of list) {
      const req = row.request || "Unknown request";
      const test = row.test || "Unknown assertion";
      const msg = row.message || "Error";
      if (isNoiseRow(test, msg)) continue;

      if (row.href && !reqHref.has(req)) reqHref.set(req, row.href);

      const key = `${test}||${msg}`;
      if (!byReq.has(req)) byReq.set(req, new Map());
      const m = byReq.get(req);
      if (!m.has(key)) m.set(key, { test, message: msg, count: 0 });
      m.get(key).count += 1;
    }

    if (byReq.size === 0)
      return `<div class="note">No failed request details after filtering.</div>`;

    let html = "";
    const base =
      hrefBase ? escapeHtml(String(hrefBase).replace(/\\\\/g, "/")) : null;
    for (const [req, map] of byReq) {
      const total = Array.from(map.values()).reduce((s, r) => s + r.count, 0);
      const checks = Array.from(map.values())
        .map(
          (r) => `
        <li>
          <div class="assert">${escapeHtml(r.test)} <span class="count">×${r.count}</span></div>
          <pre class="msg">${escapeHtml(r.message)}</pre>
        </li>
      `
        )
        .join("");

      const anchor = reqHref.get(req);
      const href =
        base ?
          anchor ? `${base}${escapeHtml(anchor)}`
          : base
        : null;
      html += `
        <details class="req" open>
          <summary>
            <span>${href ? `<a href="${href}" target="_blank" rel="noopener">${escapeHtml(req)}</a>` : escapeHtml(req)}</span>
            <span class="count">${total} failing check(s)</span>
          </summary>
          <ul class="checks">
            ${checks}
          </ul>
        </details>
      `;
    }

    return html;
  }
  // --- end moved function ---

  // Details: ONLY collections with failures; ONLY failed requests inside
  const detailBlocks = collections
    .filter((c) => (c.__failed_normalized || 0) > 0)
    .map((col) => {
      const failed = col.__failed_normalized || 0;

      // Build a list of failures (JSON preferred)
      let list = [];
      if (Array.isArray(col.failures) && col.failures.length > 0) {
        list = col.failures.slice(0, JSON_DETAILS_MAX_ROWS).map((f) => ({
          request: f.request || "Unknown request",
          test: redactSensitive(f.test || "Unknown assertion"),
          message: redactSensitive(f.message || "Error"),
        }));
      } else if (col.__htmlPath && ENABLE_HTML_DETAILS_FALLBACK) {
        try {
          const html = fs.readFileSync(col.__htmlPath, "utf-8");
          list = parseFailureDetailsFromHtml(html);
        } catch {
          /* ignore */
        }
      }

      const groupedHtml = renderFailedRequests(list, col.__htmlPath || null);
      const note =
        Array.isArray(col.failures) && col.failures.length > 0 ?
          `<div class="note">From <code>report.json</code>.</div>`
        : `<div class="note">Parsed from HTML (no <code>report.json</code> present). Secrets redacted; headers/metadata filtered. Request name/URL inferred from nearby headings.</div>`;

      return `
        <details class="card" open>
          <summary class="card-header summary">
            <h3 class="card-title">Failures — ${escapeHtml(col.collectionName)}</h3>
            <span class="badge badge-fail">${failed}</span>
          </summary>
          ${groupedHtml}
          ${note}
        </details>
      `;
    })
    .join("");

  const totalFailed = collections.reduce(
    (sum, col) => sum + (col.__failed_normalized || 0),
    0
  );
  const footerHtml =
    totalFailed === 0 ? "<p><strong>No failed tests 🎉</strong></p>" : "";

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Newman Test Summary</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 2rem; background: #f9f9f9; color:#222; }
          h1, h2, h3 { color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 2rem; }
          th, td { padding: 12px; border: 1px solid #ccc; text-align: left; }
          th { background: #333; color: white; }
          tr:nth-child(even) { background: #f2f2f2; }
          .fail { color: #c9372c; font-weight: bold; }

          /* Cards & badges */
          .card { background: #fff; border: 1px solid #ddd; border-radius: 10px; margin: 20px 0; box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
          .card-header { padding: 14px 18px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
          .card-title { margin: 0; font-size: 18px; font-weight: 600; }
          .badge { padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
          .badge-pass { background: #e5f7ed; color: #1f845a; }
          .badge-fail { background: #fdecea; color: #c9372c; }
          summary { cursor: pointer; }
          .note { padding: 12px 16px; color:#555; }
          code { background:#eee; padding:2px 4px; border-radius:3px; }

          /* Request blocks (FAILED ONLY) */
          .req { margin:10px 0; border-radius:8px; border-left:6px solid #c9372c; background:#fdecea; }
          .req > summary { padding:10px 12px; font-weight:600; display:flex; justify-content:space-between; align-items:center; }
          .req > summary .count { font-size:12px; background:#fff; color:#c9372c; border:1px solid #f3c0ba; padding:2px 6px; border-radius:999px; }
          .checks { margin:0 0 6px 0; padding:0 16px 12px 22px; }
          .checks li { margin:8px 0; }
          .assert { font-weight:600; }
          .msg { margin:4px 0 0 0; padding:6px 8px; background: #fff; border:1px solid #f3c0ba; border-radius:6px; white-space: pre-wrap; font-family: monospace; font-size: 12px; }
        </style>
      </head>
      <body>
        ${summaryTable}

        <h2>Failed requests</h2>
        ${detailBlocks || '<div class="note">No collections with failures.</div>'}

        ${footerHtml}
      </body>
    </html>
  `;
}

/* ================================ 5) Main ================================ */
function run() {
  const unzippedPath = path.join(__dirname, "unzipped");
  const reportPaths = findAllReports(unzippedPath);
  const summaries = [];

  console.log(`🔍 Found ${reportPaths.length} report(s)...`);

  for (const reportHtmlPath of reportPaths) {
    try {
      const dir = path.dirname(reportHtmlPath);
      const html = fs.readFileSync(reportHtmlPath, "utf-8");

      const jsonPath = path.join(dir, "report.json");
      const json =
        fs.existsSync(jsonPath) ?
          JSON.parse(fs.readFileSync(jsonPath, "utf-8"))
        : null;

      const collectionName = path.basename(dir);
      const summary = parseHtmlSummary(html, collectionName);

      // Prefer JSON for detailed assertions (if present)
      summary.failures = json ? parseFailedTests(json) : [];

      // only pass path for optional HTML-fallback parsing (no DOM/raw kept)
      if (!json) summary.__htmlPath = reportHtmlPath;

      summaries.push(summary);
    } catch (err) {
      console.log(`❌ Error reading ${reportHtmlPath}:`, err.message);
    }
  }

  const finalHtml = createSummaryHtml(summaries);
  fs.writeFileSync("summary.html", finalHtml, "utf-8");
  console.log("✅ summary.html created successfully!");
}

run();
//Should open a browser tab with the summary.html file
