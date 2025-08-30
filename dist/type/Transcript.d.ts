export interface Transcript {
    snippets: TranscriptSnippet[];
    language: string;
    language_code: string;
    is_generated: boolean;
}
export interface TranscriptSnippet {
    text: string;
    start: number;
    duration: number;
}
