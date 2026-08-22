// @vitest-environment node
//
// Gallery render must stay zero-network: committed JPEG fixtures become
// data URIs, and the SVG must not carry http(s) image hrefs.

import { describe, expect, it } from "vitest"
import { renderSlideSvg } from "@/api"
import { findRemoteAssetRef } from "@/platform/registry"
import { installNodePlatform } from "@/platform/node"
import { corpusAssets, layoutPage } from "./corpus/decks"
import { LEXICONS } from "./corpus/lexicon"

await installNodePlatform()

describe("offline gallery assets", () => {
  it("embeds JPEG fixtures as data URIs and never a remote image href", async () => {
    const assets = await corpusAssets(LEXICONS.zh)
    for (const img of Object.values(assets.images ?? {})) {
      expect(img.src.startsWith("data:")).toBe(true)
    }
    const svg = renderSlideSvg(layoutPage("image-split", LEXICONS.zh, assets), 0)
    expect(findRemoteAssetRef(svg)).toBeNull()
    const hrefs = [...svg.matchAll(/<image\b[^>]*>/gi)].flatMap((tag) =>
      [...tag[0]!.matchAll(/\s(?:xlink:href|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]!),
    )
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(href.startsWith("http://") || href.startsWith("https://")).toBe(false)
      expect(href.startsWith("data:")).toBe(true)
    }
  })
})
