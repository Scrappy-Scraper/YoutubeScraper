import { ListVideoInfo } from "./type/ListVideoInfo.js";
import { ChannelInfo } from "./type/ChannelInfo.js";
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
        retryCount?: number;
    }): Promise<void>;
    fetchMoreVideos(): Promise<ListVideoInfo[]>;
    hasMoreVideos(): boolean;
    toJSON(): ChannelInfo;
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
