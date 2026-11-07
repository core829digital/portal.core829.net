import { describe, expect, it } from "vitest";
import { deriveConvexSiteUrl } from "./convexUrls";

describe("deriveConvexSiteUrl", () => {
  it("ricava .convex.site da .convex.cloud", () => {
    expect(deriveConvexSiteUrl("https://happy-otter-123.convex.cloud")).toBe("https://happy-otter-123.convex.site");
    expect(deriveConvexSiteUrl("https://happy-otter-123.convex.cloud/")).toBe("https://happy-otter-123.convex.site");
  });
  it("usa l'indirizzo esplicito se c'e' (solo l'origine)", () => {
    expect(deriveConvexSiteUrl("https://x.convex.cloud", "https://api.core829.net/qualcosa")).toBe("https://api.core829.net");
  });
  it("non inventa nulla quando non puo' ricavarlo", () => {
    expect(deriveConvexSiteUrl("http://127.0.0.1:3210")).toBeNull();
    expect(deriveConvexSiteUrl("https://convex.cloud.evil.com")).toBeNull();
    expect(deriveConvexSiteUrl("non-un-url")).toBeNull();
    expect(deriveConvexSiteUrl(undefined)).toBeNull();
    expect(deriveConvexSiteUrl("https://x.convex.cloud", "non-un-url")).toBeNull();
  });
});
