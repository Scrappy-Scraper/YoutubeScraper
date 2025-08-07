export default class VideoParser {
    get videoId(): string;
    get channelId(): string;
    get availableCaptions(): {
        name: string;
        languageCode: string;
        isGenerated: boolean;
    }[];
    private _videoId;
    private _proxyUrls;
    private _proxyUrlGenerator;
    private _cookies;
    private _metadata;
    private _transcripts;
    constructor(params?: {
        proxyUrls?: string | string[];
        cookies?: {
            [key: string]: string;
        };
        proxyUrlGenerator?: (sessionId?: string | undefined | null) => Promise<string | undefined>;
    });
    load(params: {
        videoId: string;
    }): Promise<{
        [key in string]: any;
    }>;
    fetchTranscripts(params: {
        languageLimit?: number;
        preferredLanguages?: string[];
    }): Promise<Transcript[]>;
    toJSON(): VideoMetadata;
    private getProxyUrl;
    private fetchVideoHtml;
}
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
export type VideoMetadata = {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    length: number;
    viewCount: number;
    channelId: string;
    author: string;
    isPrivate: boolean;
    transcripts: Transcript[];
    availableTranscripts: {
        name: string;
        languageCode: string;
        isGenerated: boolean;
    }[];
};
