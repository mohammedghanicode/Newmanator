import fs from "fs";
import path from "path";
import request from "supertest";
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// require the app (server.js now guards listen by require.main)
const app = await import("../server.js").then((m) => m.default || m);

const SAMPLE = path.join(
  __dirname,
  "..",
  "unzipped",
  "agent-report",
  "report.html",
);

describe("Upload integration", () => {
  it("uploads sample and produces filtered summary (no response-time failures)", async () => {
    const res = await request(app)
      .post("/api/upload")
      .attach("files", SAMPLE)
      .timeout({ response: 120000, deadline: 300000 });

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeTruthy();
    const sessionId = res.body.sessionId;

    // poll status
    let status;
    for (let i = 0; i < 60; i++) {
      const s = await request(app).get(`/api/status/${sessionId}`);
      if (s.status === 200) {
        status = s.body;
        if (status.status === "complete" || status.status === "error") break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    expect(status).toBeTruthy();
    expect(status.status).toBe("complete");

    const results = await request(app).get(`/api/results/${sessionId}`);
    expect(results.status).toBe(200);
    const html = results.body.html || "";

    // Expect the failed count to be zero (filtered)
    expect(html).toMatch(/<td[^>]*class=\"fail\"[^>]*>0<\/td>/);
  }, 180000);
});
