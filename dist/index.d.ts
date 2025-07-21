export declare class VideoParser {
    get videoId(): string;
    get channelId(): string;
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
        limit?: number;
    }): Promise<Transcript[]>;
    toJSON(): {
        id: string;
        title: any;
        description: any;
        thumbnail: string;
        length: number;
        viewCount: number;
        channelId: any;
        author: any;
        isPrivate: any;
        transcripts: Transcript[];
    };
    private getProxyUrl;
    private fetchVideoHtml;
}
export declare class ChannelParser {
    get videos(): ListVideoInfo[];
    get channelId(): string;
    private _channelId;
    private _proxyUrls;
    private _proxyUrlGenerator;
    private _metadata;
    private _videos;
    private _headers;
    private static apiEndpoint;
    private _proxyUrl;
    private _apiKey;
    private _requestClientData;
    private _nextPageAccessData;
    constructor(params?: {
        proxyUrls?: string | string[];
        cookies?: {
            [key: string]: string;
        };
        proxyUrlGenerator?: (sessionId?: string | undefined | null) => Promise<string | undefined>;
    });
    load(params: {
        channelId: string;
    }): Promise<{
        videoId: string;
        thumbnail: string;
        title: string;
    }[]>;
    fetchMoreVideos(): Promise<ListVideoInfo[]>;
    hasMoreVideos(): boolean;
    toJSON(): {
        [key in string]: any;
    };
    private getProxyUrl;
    private static parseVideoData;
    static getNextPageAccessData(data: any, sortBy?: string): {
        token: any;
        clickParams: {
            clickTrackingParams: any;
        };
    } | null;
    static extractVideos(pageDataContents: any): {
        [key in string]: any;
    }[];
}
export declare function getAllDescendantObjects(params: {
    rootNode: ObjNode;
    isMatch: (params: {
        node: ObjNode;
        parentKey?: string | null;
    }) => boolean;
    parentKey?: string | null | undefined;
}): {
    [key in string]: any;
}[];
type ObjNode = {
    [key in string]: any;
} | ObjNode[] | number | boolean | string | null | undefined;
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
type ListVideoInfo = {
    videoId: string;
    title: string;
    thumbnail: string;
};
export {};
