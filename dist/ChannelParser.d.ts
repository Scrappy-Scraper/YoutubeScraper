export default class ChannelParser {
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
    }): Promise<void>;
    fetchMoreVideos(): Promise<ListVideoInfo[]>;
    hasMoreVideos(): boolean;
    toJSON(): {
        videos: {
            videoId: string;
            thumbnail: string;
            title: string;
        }[];
        id?: string | undefined;
        title?: string | undefined;
        description?: string | undefined;
        thumbnail?: string | undefined;
        rssUrl?: string | undefined;
        channelUrl?: string | undefined;
        vanityChannelUrl?: string | undefined;
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
type ListVideoInfo = {
    videoId: string;
    title: string;
    thumbnail: string;
};
export {};
