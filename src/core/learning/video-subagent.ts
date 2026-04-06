import { VideoSubagentResult } from './types';
import apiGateway from '../api-gateway';
import { YoutubeTranscript } from 'youtube-transcript';

export class VideoSubagent {
  private appName: string;
  private startTimeOffset: number;
  private endTimeOffset: number;
  private videoUrl: string;

  /**
   * @param appName The app being researched
   * @param videoUrl The target YouTube or tutorial URL
   * @param startTimeOffset Start timeline mark (seconds)
   * @param endTimeOffset End timeline mark (seconds)
   */
  constructor(appName: string, videoUrl: string, startTimeOffset: number, endTimeOffset: number) {
    this.appName = appName;
    this.videoUrl = videoUrl;
    this.startTimeOffset = startTimeOffset;
    this.endTimeOffset = endTimeOffset;
  }

  /**
   * Spins up an isolated context, loads the video to the specific timestamp, 
   * and parses frames through the VLM.
   */
  public async analyzeVideoChunk(): Promise<VideoSubagentResult> {
    console.log(`[VideoSubAgent] Extracting free transcript for ${this.videoUrl} timestamp [${this.startTimeOffset}s -> ${this.endTimeOffset}s]...`);
    
    let transcriptText = "";
    try {
      const transcriptList = await YoutubeTranscript.fetchTranscript(this.videoUrl);
      // Filter out only the slice we care about
      const slice = transcriptList.filter(t => t.offset >= (this.startTimeOffset * 1000) && t.offset <= (this.endTimeOffset * 1000));
      transcriptText = slice.map(t => t.text).join(' ');
      console.log(`[VideoSubAgent] Extracted ${transcriptText.length} characters of transcript data.`);
    } catch (e) {
      console.error(`[VideoSubAgent] Failed to fetch transcript natively:`, e);
      transcriptText = "Transcript unavailable. Infer basic functionality from the timeline.";
    }

    const prompt = `You are a Semantic Parsing Subagent running a conceptual timeline analysis.
App: "${this.appName}"
Timeline Slice: ${this.startTimeOffset}s to ${this.endTimeOffset}s.
[EXTRACTED YOUTUBE TUTORIAL TRANSCRIPT]
${transcriptText}

Analyze the underlying concepts, logic loops, and core functionality derived from this tutorial context.
Return the response strictly as valid JSON matching this structure:
{
  "uiMaps": [ { "panelName": "Toolbar", "estimatedPosition": "left", "containsElements": ["Select tool"] } ],
  "coreParadigms": [ "Everything in this app begins with creating a base Node." ],
  "creativeWorkflows": [ "To build a complex object, start with primitives and apply boolean modifiers." ],
  "visualNotes": "Brief 1 sentence note on visual flow."
}
Return literally nothing but the JSON object. Do not use markdown tags.`;

    try {
      const response = await apiGateway.queryKnowledge(prompt);
      
      if (response && typeof response === 'object' && 'data' in (response as any)) {
        const rawString = ((response as any).data?.content) || ((response as any).data) || '{}';
        const cleanString = typeof rawString === 'string' ? rawString.replace(/```json/g, '').replace(/```/g, '').trim() : "{}";
        
        try {
          const parsed = JSON.parse(cleanString) as VideoSubagentResult;
          return {
            uiMaps: parsed.uiMaps || [],
            coreParadigms: parsed.coreParadigms || [],
            creativeWorkflows: parsed.creativeWorkflows || [],
            visualNotes: parsed.visualNotes || 'API provided no visual notes.'
          };
        } catch (parseError) {
          console.error(`[VideoSubAgent] JSON format error from API: `, parseError);
        }
      }
    } catch (e) {
      console.error(`[VideoSubAgent] API request failed:`, e);
    }

    // Fallback if API fails or parsing breaks
    return {
      uiMaps: [],
      coreParadigms: [],
      creativeWorkflows: [],
      visualNotes: `Failed to fetch conceptual knowledge map for ${this.appName}.`
    };
  }
}
