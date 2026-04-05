export class LiveSearch {
  /**
   * Performs a lightweight DuckDuckGo HTML search wrapper.
   */
  public async search(query: string): Promise<string[]> {
    console.log(`[LiveSearch] Querying web for: ${query}`);
    try {
      const resp = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        }
      });
      const html = await resp.text();
      
      // Light regex extraction from DuckDuckGo's result snippet class 'result__snippet'
      const snippetRegex = /<a class="result__snippet[^>]*>(.*?)<\/a>/gi;
      const results: string[] = [];
      let match;
      
      while ((match = snippetRegex.exec(html)) !== null && results.length < 5) {
        // Strip inner HTML tags
        const cleanSnippet = match[1].replace(/<\/?[^>]+(>|$)/g, "").trim();
        results.push(cleanSnippet);
      }
      
      return results;
    } catch (e) {
      console.error('[LiveSearch] Request failed', e);
      return [];
    }
  }

  /**
   * Specifically targets and extracts destination URLs from a DuckDuckGo search.
   */
  public async searchUrls(query: string): Promise<string[]> {
    console.log(`[LiveSearch] Querying web URLs for: ${query}`);
    try {
      const resp = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        }
      });
      const html = await resp.text();
      
      const urlRegex = /<a class="result__url" href="([^"]+)">/gi;
      const results: string[] = [];
      let match;
      
      while ((match = urlRegex.exec(html)) !== null && results.length < 5) {
        // DDG routes links through a redirect handler sometimes, so we decode it if necessary.
        // But for raw html DDG usually just gives the direct href if JS is disabled or an absolute link.
        let rawUrl = match[1];
        if (rawUrl.startsWith('//')) {
          rawUrl = `https:${rawUrl}`;
        }
        results.push(rawUrl);
      }
      return results;
    } catch (e) {
      console.error('[LiveSearch] URL Request failed', e);
      return [];
    }
  }
}

export const liveSearch = new LiveSearch();
