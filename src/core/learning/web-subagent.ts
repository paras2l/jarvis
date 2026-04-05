import { WebSubagentResult } from './types';
import apiGateway from '../api-gateway';

export class WebSubagent {
  private appName: string;

  constructor(appName: string) {
    this.appName = appName;
  }

  /**
   * Executes invisible background searches spanning Google, Wikis, and API queries.
   */
  public async executeResearch(): Promise<WebSubagentResult> {
    console.log(`[WebSubAgent] Spawning web research mission for: ${this.appName}`);
    
    // Construct the explicit LLM prompt requesting structured JSON data
    const prompt = `You are an Application Research Subagent. 
Your objective is to find keyboard shortcuts and core operations for the software: "${this.appName}".
Return the response strictly as valid JSON matching this structure:
{
  "shortcuts": [
    { "actionDescription": "Save File", "keyCombo": "Ctrl+S", "context": "Global" }
  ],
  "rawSummary": "A brief 2 sentence summary of what this app is and its core UI design."
}
Return literally nothing but the JSON object. Do not use markdown tags.`;

    try {
      const response = await apiGateway.queryKnowledge(prompt);
      
      // Attempt to parse the response to match our internal strict types
      if (response && typeof response === 'object' && 'data' in (response as any)) {
        const rawString = ((response as any).data?.content) || ((response as any).data) || '{}';
        const cleanString = typeof rawString === 'string' ? rawString.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim() : "{}";
        
        try {
          const parsed = JSON.parse(cleanString) as WebSubagentResult;
          return {
            shortcuts: parsed.shortcuts || [],
            rawSummary: parsed.rawSummary || 'API provided no summary.'
          };
        } catch (parseError) {
          console.error(`[WebSubAgent] JSON format error from API: `, parseError);
        }
      }
    } catch (e) {
      console.error(`[WebSubAgent] API request failed:`, e);
    }

    // Fallback if API fails or parsing breaks
    return {
      shortcuts: [],
      rawSummary: `Failed to fetch valid knowledge for ${this.appName} from LLM.`
    };
  }
}
