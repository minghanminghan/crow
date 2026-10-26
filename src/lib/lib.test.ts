import { describe, expect, it } from "vitest";
import { parsePreview } from "./preview";
import { resolveDataPath, slug } from "./store";

describe("parsePreview", () => {
  it("reads og tags and resolves relative images", () => {
    const html = `<meta property="og:title" content="ColBERT &amp; friends"><meta content="/img.png" property="og:image"><meta name="description" content="Late interaction">`;
    expect(parsePreview(html, "https://www.arxiv.org/abs/1")).toEqual({
      title: "ColBERT & friends",
      description: "Late interaction",
      image: "https://www.arxiv.org/img.png",
      site: "arxiv.org",
    });
  });

  it("falls back to <title> and hostname", () => {
    expect(parsePreview("<title>Hi</title>", "https://example.com/x")).toEqual({
      title: "Hi",
      image: undefined,
      site: "example.com",
    });
  });
});

describe("store paths", () => {
  it("blocks paths outside the data dir", () => {
    expect(resolveDataPath("../package.json")).toBeNull();
    expect(resolveDataPath("assets/../../x")).toBeNull();
    expect(resolveDataPath("assets/a.png")).toMatch(/data\/assets\/a\.png$/);
  });

  it("slugs names", () => {
    expect(slug("RAG research!")).toBe("rag-research");
    expect(slug("???")).toBe("canvas");
  });
});
