import { describe, it, expect } from "vitest";
import { classifyGoogleError, alertMessage } from "../src/lib/google/health.js";

// Proactive Google health check: the classifier must tell apart the two recurring
// real failures (refresh-token expiry vs API-not-enabled) from everything else,
// and the alert text must carry the exact remediation (console link + the doc).
describe("googleHealth — classify degradation + crisp remediation", () => {
  it("classifies invalid_grant as an expired token", () => {
    expect(classifyGoogleError(`{"error":"invalid_grant","error_description":"Token has been expired or revoked."}`).kind).toBe("token_expired");
    expect(classifyGoogleError("Not authorized — run `npm run google-auth`.").kind).toBe("token_expired");
  });

  it("classifies SERVICE_DISABLED 403 as api_disabled and names the API", () => {
    const drive = classifyGoogleError(`Google Drive API has not been used in project 878601266193 ... SERVICE_DISABLED`);
    expect(drive.kind).toBe("api_disabled");
    expect(drive.api).toBe("drive");

    const gmail = classifyGoogleError(`accessNotConfigured: Gmail API is not enabled`);
    expect(gmail.kind).toBe("api_disabled");
    expect(gmail.api).toBe("gmail");
  });

  it("does NOT misclassify unrelated errors", () => {
    expect(classifyGoogleError("network timeout").kind).toBe("unknown");
    expect(classifyGoogleError("HTTP 500").kind).toBe("unknown");
  });

  it("token_expired alert points at PUBLISH APP + the doc", () => {
    const msg = alertMessage({ ok: false, kind: "token_expired", detail: "" });
    expect(msg).toContain("console.cloud.google.com/auth/audience?project=878601266193");
    expect(msg).toContain("npm run google-auth");
    expect(msg).toContain("server/docs/google-auth-production.md");
  });

  it("api_disabled alert names the API + its enable link", () => {
    const msg = alertMessage({ ok: false, kind: "api_disabled", detail: "drive: ..." }, "drive");
    expect(msg).toContain("Drive API");
    expect(msg).toContain("apis/library/drive.googleapis.com?project=878601266193");
    expect(msg).toContain("server/docs/google-auth-production.md");
  });
});
