import { BookSubagentResult } from './types';
import { liveSearch } from './live-search';
import apiGateway from '../api-gateway';

export class BookSubagent {
  private topicQuery: string;
  private localFilePath?: string;

  /**
   * @param topicQuery e.g., "Blender 3D Architecture" or "Screenwriting structures"
   * @param localFilePath optional local path to a PDF file on the user's hard drive
   */
  constructor(topicQuery: string, localFilePath?: string) {
    this.topicQuery = topicQuery;
    this.localFilePath = localFilePath;
  }

  /**
   * Performs an aggressive web search for document resources, synthesizes them, and extracts concepts.
   * Or, if a local PDF path is provided, it extracts the entire book.
   */
  public async readAndAnalyze(): Promise<BookSubagentResult> {
    console.log(`[BookSubAgent] Hunting for deep literature regarding: ${this.topicQuery}`);
    let combinedSnippets = "";

    if (this.localFilePath && this.localFilePath.toLowerCase().endsWith('.pdf')) {
      console.log(`[BookSubAgent] Local PDF detected. Parsing via native bridge: ${this.localFilePath}`);
      if (window.nativeBridge && window.nativeBridge.readPdf) {
        const result = await window.nativeBridge.readPdf(this.localFilePath);
        if (result.success && result.text) {
          // Truncate if massive
          combinedSnippets = result.text.substring(0, 25000);
          console.log(`[BookSubAgent] Extracted ${combinedSnippets.length} chars from Local PDF.`);
        } else {
          console.error(`[BookSubAgent] PDF parse failed: ${result.message}`);
        }
      }
    } 

    // Try remote PDF fetch if local failed or absent
    if (!combinedSnippets) {
      console.log(`[BookSubAgent] Hunting for Remote PDFs...`);
      const pdfUrls = await liveSearch.searchUrls(`${this.topicQuery} manual tutorial book ext:pdf`);
      // Fallback: DDG sometimes encodes the URL via url=?q=
      for (const rawUrl of pdfUrls) {
        let pdfTarget = rawUrl;
        if (pdfTarget.includes('uddg=')) {
          const match = /uddg=([^&]+)/.exec(pdfTarget);
          if (match) pdfTarget = decodeURIComponent(match[1]);
        }
        
        if (pdfTarget.endsWith('.pdf')) {
          console.log(`[BookSubAgent] Remote PDF discovered: ${pdfTarget}`);
          if (window.nativeBridge && window.nativeBridge.readPdf) {
            const result = await window.nativeBridge.readPdf(pdfTarget);
            if (result.success && result.text) {
              combinedSnippets = result.text.substring(0, 25000);
              console.log(`[BookSubAgent] Extracted ${combinedSnippets.length} chars from Remote PDF.`);
              break; // Break loop if we successfully ripped a huge pdf
            }
          }
        }
      }
    }

    // Try HTML search if Remote PDF failed
    if (!combinedSnippets) {
      console.log(`[BookSubAgent] No PDFs found. Swapping to basic HTML scraper.`);
      const searchResults = await liveSearch.search(`${this.topicQuery} manual tutorial guide filetype:html`);
      combinedSnippets = searchResults.join('\n');
    }

    // 2. Feed the literature snippets to the LLM to extract foundational knowledge paradigms
    const prompt = `You are a Book Parsing Subagent.
Topic: "${this.topicQuery}"
[LITERATURE SNIPPETS]:
${combinedSnippets}

Analyze the underlying concepts, philosophies, and core workflows associated with this topic.
Return the response strictly as valid JSON matching this structure:
{
  "coreParadigms": [ "The fundamental philosophy of this topic involves X and Y." ],
  "creativeWorkflows": [ "A common professional practice is to apply method Z." ]
}
Return literally nothing but the JSON object. Do not use markdown tags.`;

    try {
      const response = await apiGateway.queryKnowledge(prompt);
      
      if (response && typeof response === 'object' && 'data' in (response as any)) {
        const rawString = ((response as any).data?.content) || ((response as any).data) || '{}';
        const cleanString = typeof rawString === 'string' ? rawString.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim() : "{}";
        
        try {
          const parsed = JSON.parse(cleanString) as BookSubagentResult;
          return {
            coreParadigms: parsed.coreParadigms || [],
            creativeWorkflows: parsed.creativeWorkflows || [],
            bookSource: this.localFilePath ? `Local PDF: ${this.localFilePath}` : `Aggregated Web Scrape`
          };
        } catch (parseError) {
          console.error(`[BookSubAgent] JSON format error from API: `, parseError);
        }
      }
    } catch (e) {
      console.error(`[BookSubAgent] API request failed:`, e);
    }

    return {
      coreParadigms: [],
      creativeWorkflows: [],
      bookSource: 'Literature Search Failed'
    };
  }
}
