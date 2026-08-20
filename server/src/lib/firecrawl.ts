/**
 * Firecrawl integration for scraping website content into markdown sources.
 *
 * Requires `FIRECRAWL_API_KEY` in the environment.
 */

import Firecrawl from "@mendable/firecrawl-js";
import { ValidationError } from "../types/app-error.js";
import { assertPublicUrl } from "./url-guard.js";

/**
 * Scrapes a public URL and returns clean markdown suitable for RAG indexing.
 *
 * @param url - Page URL to scrape (must be reachable by Firecrawl)
 * @returns Markdown content, optional page title, and canonical source URL
 * @throws {ValidationError} When Firecrawl is not configured or extraction fails
 */
export async function scrapeWebsite(url: string) {
    const apiKey = process.env.FIRECRAWL_API_KEY;

    if (!apiKey) {
        throw new ValidationError("Firecrawl is not configured on the server");
    }

    // Re-checked here even though the import endpoint already checked: this is
    // the last point before a reader-supplied address is handed to a service
    // that will fetch it, and the check is cheap next to the scrape.
    //
    // The scraper fetches from its own network, not ours, so this is not
    // protecting our private network — it is refusing to make the product a
    // convenient probe for anyone else's.
    const { url: verified } = await assertPublicUrl(url);

    const client = new Firecrawl({ apiKey });
    const result = await client.scrape(verified.toString(), {
        formats: ["markdown"],
    });

    const markdown = result.markdown?.trim();

    if (!markdown) {
        throw new ValidationError("Could not extract content from this URL");
    }

    return {
        markdown,
        title: result.metadata?.title,
        sourceUrl: result.metadata?.sourceURL ?? url,
    };
}
