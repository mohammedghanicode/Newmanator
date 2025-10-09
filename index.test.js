import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";
import nodemailer from "nodemailer";
import { unzipAllInFolder, parseNewmanHtml, sendEmail } from "../index";

// --- Mocks ---
vi.mock("fs");
vi.mock("adm-zip");
vi.mock("nodemailer");

describe("unzipAllInFolder", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("test_unzipAllInFolder_success", () => {
    const mockZipFiles = ["report1.zip", "report2.zip", "notazip.txt"];
    fs.readdirSync.mockReturnValue(mockZipFiles);

    const extractAllTo = vi.fn();
    AdmZip.mockImplementation(() => ({
      extractAllTo,
    }));

    unzipAllInFolder("mockZipFolder", "mockOutputFolder");

    expect(AdmZip).toHaveBeenCalledTimes(2);
    expect(AdmZip).toHaveBeenCalledWith(
      path.join("mockZipFolder", "report1.zip")
    );
    expect(AdmZip).toHaveBeenCalledWith(
      path.join("mockZipFolder", "report2.zip")
    );
    expect(extractAllTo).toHaveBeenCalledTimes(2);
    expect(extractAllTo).toHaveBeenCalledWith(
      path.join("mockOutputFolder", "report1"),
      true
    );
    expect(extractAllTo).toHaveBeenCalledWith(
      path.join("mockOutputFolder", "report2"),
      true
    );
  });

  it("test_unzipAllInFolder_no_zip_files", () => {
    fs.readdirSync.mockReturnValue(["file1.txt", "file2.doc"]);
    unzipAllInFolder("mockZipFolder", "mockOutputFolder");
    expect(AdmZip).not.toHaveBeenCalled();
  });
});

describe("parseNewmanHtml", () => {
  it("test_parseNewmanHtml_valid_html", () => {
    const html = `
      <div class="summary-row">
        <span class="label">Total Requests</span>
        <span class="value">10</span>
      </div>
      <div class="summary-row">
        <span class="label">Passed</span>
        <span class="value">9</span>
      </div>
    `;
    const result = parseNewmanHtml(html);
    expect(result).toEqual([
      { label: "Total Requests", value: "10" },
      { label: "Passed", value: "9" },
    ]);
  });

  it("test_parseNewmanHtml_malformed_or_missing_html", () => {
    // Malformed HTML: missing .label or .value
    const malformedHtml = `
      <div class="summary-row">
        <span class="label"></span>
        <span class="value">10</span>
      </div>
      <div class="summary-row">
        <span class="label">Passed</span>
        <span class="value"></span>
      </div>
      <div class="summary-row"></div>
    `;
    const result = parseNewmanHtml(malformedHtml);
    expect(result).toEqual([]);
  });
});

describe("sendEmail", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("test_sendEmail_success", async () => {
    const sendMailMock = vi.fn().mockResolvedValue({ messageId: "12345" });
    nodemailer.createTransport.mockReturnValue({ sendMail: sendMailMock });

    await sendEmail("<html>test</html>");

    expect(nodemailer.createTransport).toHaveBeenCalled();
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        html: "<html>test</html>",
      })
    );
  });

  it("test_sendEmail_failure", async () => {
    const sendMailMock = vi.fn().mockRejectedValue(new Error("SMTP error"));
    nodemailer.createTransport.mockReturnValue({ sendMail: sendMailMock });

    let errorCaught = null;
    try {
      await sendEmail("<html>fail</html>");
    } catch (err) {
      errorCaught = err;
    }
    expect(nodemailer.createTransport).toHaveBeenCalled();
    expect(sendMailMock).toHaveBeenCalled();
    expect(errorCaught).toBeInstanceOf(Error);
    expect(errorCaught.message).toBe("SMTP error");
  });
});
