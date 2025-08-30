import { VideoInfo } from "./type/VideoInfo.js";
import { Transcript } from "./type/Transcript.js";
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
    toJSON(): VideoInfo;
    private getProxyUrl;
    private fetchVideoHtml;
}
