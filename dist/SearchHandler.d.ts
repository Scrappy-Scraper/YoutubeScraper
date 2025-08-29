import { ListVideoInfo } from "./type/ListVideoInfo.js";
import { ListChannelInfo } from "./type/ListChannelInfo.js";
export default class SearchHandler {
    query: string | null;
    private _proxyUrls;
    private _proxyUrlGenerator;
    private _cookies;
    private _headers;
    private _proxyUrl;
    private _apiKey;
    private _requestClientData;
    private _nextPageAccessData;
    private _items;
    static apiEndpoint: string;
    search(params: {
        query: string;
        sortBy?: SortBy;
        resultsType?: ResultType;
    }): Promise<void>;
    fetchMoreItems(): Promise<(ListVideoInfo | ListChannelInfo)[]>;
    hasMoreItems(): boolean;
    toJSON(): {
        items: (ListVideoInfo | ListChannelInfo)[];
        data_fetched_time: number;
    };
    private getProxyUrl;
    constructor(params?: {
        proxyUrls?: string | string[];
        cookies?: {
            [key: string]: string;
        };
        proxyUrlGenerator?: (sessionId?: string | undefined | null) => Promise<string | undefined>;
    });
}
type SortBy = "relevance" | "upload_date" | "view_count" | "rating";
type ResultType = "video" | "channel" | "playlist" | "movie";
export {};
