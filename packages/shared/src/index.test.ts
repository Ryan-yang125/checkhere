import { describe, expect, it } from "vitest";
import { CHECKHERE_VERSION, REPORT_SCHEMA_VERSION, validatePublicHttpUrl } from "./index.js";

describe("versioned report contract", () => {
  it("exposes the v0.3 report contract constants", () => {
    expect(CHECKHERE_VERSION).toBe("0.4.0");
    expect(REPORT_SCHEMA_VERSION).toBe("3.0");
  });
});

describe("validatePublicHttpUrl", () => {
  it("accepts public http and https URLs", () => {
    expect(validatePublicHttpUrl("https://example.com/path#x").ok).toBe(true);
    expect(validatePublicHttpUrl("http://example.com").ok).toBe(true);
  });

  it("rejects local and private targets", () => {
    expect(validatePublicHttpUrl("http://localhost").ok).toBe(false);
    expect(validatePublicHttpUrl("http://127.0.0.1").ok).toBe(false);
    expect(validatePublicHttpUrl("http://10.0.0.1").ok).toBe(false);
    expect(validatePublicHttpUrl("http://172.16.0.1").ok).toBe(false);
    expect(validatePublicHttpUrl("http://192.168.1.1").ok).toBe(false);
    expect(validatePublicHttpUrl("http://169.254.169.254").ok).toBe(false);
  });

  it("rejects unsupported protocols and credentials", () => {
    expect(validatePublicHttpUrl("file:///tmp/x").ok).toBe(false);
    expect(validatePublicHttpUrl("https://user:pass@example.com").ok).toBe(false);
  });
});
