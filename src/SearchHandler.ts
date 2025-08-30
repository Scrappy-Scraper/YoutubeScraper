import {
    findInObject,
    getAllDescendantObjects,
    getJsonFromHtml,
    makeHttpRequest,
    ObjNode,
    unescapeHtml
} from "./utils.js";
import {md5} from "js-md5";
import extractInnerTubeApiKeyFromHtml from "./extractInnerTubeApiKeyFromHtml.js";
import {ListVideoInfo} from "./type/ListVideoInfo.js";
import {ListChannelInfo} from "./type/ListChannelInfo.js";
import {getNextPageAccessData} from "./helpers/getNextPageAccessData.js";
import parseListItemData from "./helpers/parseListItemData.js";

export default class SearchHandler {
    public query: string|null = null;
    private _proxyUrls: string[] = [];
    private _proxyUrlGenerator: ((sessionId?: string | undefined | null) => Promise<string | undefined>) | null;
    private _cookies: { [key: string]: string } = {};
    private _headers: { [key: string]: string } = {};
    private _proxyUrl: string | null = null; // the proxy url that got chosen
    private _apiKey: string | null = null;
    private _requestClientData: any | null = null;
    private _nextPageAccessData: any | null = null;
    private _items: (ListVideoInfo | ListChannelInfo)[] = [];
    static apiEndpoint = 'https://www.youtube.com/youtubei/v1/search';

    async search(params: {
        query: string;
        sortBy?: SortBy;
        resultsType?: ResultType;
    }) {
        let {
            query,
            sortBy = 'relevance',
            resultsType = 'video',
        } = params;
        this.query = query;
        const paramString = `CA${SORT_BY_MAP[sortBy]}SAhA${RESULTS_TYPE_MAP[resultsType][0]}`;
        const url = `https://www.youtube.com/results?search_query=${query}&sp=${paramString}`;

        let httpResponse = await makeHttpRequest({url, proxyUrl: await this.getProxyUrl()});
        let html = httpResponse.text;
        this._proxyUrl = httpResponse.proxyUrl ?? null;
        // Handle consent cookie if needed
        if (html.includes('action="https://consent.youtube.com/s"')) {
            const match = html.match(/name="v" value="(.*?)"/);
            if (match) {
                // Set consent cookie and retry
                this._cookies.CONSENT = `YES+${match[1]}`;
                const retryResponse = await makeHttpRequest({
                    url,
                    proxyUrl: this._proxyUrl ?? undefined,
                    headers: {
                        Cookie: Object.entries(this._cookies)
                            .map(([k, v]) => `${k}=${v}`)
                            .join('; '),
                    },
                });
                html = unescapeHtml(retryResponse.text);
            }
        }

        this._apiKey = extractInnerTubeApiKeyFromHtml(html);
        this._requestClientData = JSON.parse(`${getJsonFromHtml(html, 'INNERTUBE_CONTEXT', 2, '"}},')}"}}`);
        this._headers = {
            'X-YouTube-Client-Name': '1',
            'X-YouTube-Client-Version': this._requestClientData?.client?.clientVersion ?? '',
        };
        let pageData = JSON.parse(`${getJsonFromHtml(html, 'var ytInitialData = ', 0, '};')}}`);
        let contents = findInObject(pageData, 'contents');
        let items = extractItems(contents).map(parseListItemData).filter((item) => item !== null);
        this._items = this._items.concat(items);
        this._nextPageAccessData = getNextPageAccessData(pageData);

        this.query = query;
    }

    async fetchMoreItems() {
        const response = await makeHttpRequest({
            url: `${SearchHandler.apiEndpoint}?key=${this._apiKey}`,
            proxyUrl: this._proxyUrl!,
            method: 'POST',
            requestData: JSON.stringify({
                context: {
                    clickTracking: this._nextPageAccessData.clickParams,
                    client: this._requestClientData.client,
                },
                continuation: this._nextPageAccessData.token,
            }),
            headers: {
                ...this._headers,
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                'Accept-Language': 'en',
            },
        });

        const contents = JSON.parse(response.text);
        this._nextPageAccessData = getNextPageAccessData(contents);
        const newItems = extractItems(contents).map(parseListItemData);
        let existingItemIds: Set<string> = new Set<string>(this._items.map(item => item.id).filter(item => item !== null));

        let itemsToAdd: (ListVideoInfo | ListChannelInfo)[] = [];
        for (let item of newItems) {
            if(item === null) continue;
            let itemId = item.id;
            if(itemId === null) continue;
            if(existingItemIds.has(itemId)) continue;
            itemsToAdd.push(item);
        }
        this._items = this._items.concat(itemsToAdd);

        return itemsToAdd;
    }

    hasMoreItems() {
        return this._nextPageAccessData !== null;
    }

    toJSON() {
        return {
            items: Array.from(this._items),
            data_fetched_time: Math.round((new Date()).getTime() / 1000),
        };
    }

    private async getProxyUrl(sessionId: string | undefined | null = undefined): Promise<string | undefined> {
        const urls = this._proxyUrls ?? [];
        const urlGenerator = this._proxyUrlGenerator ?? null;

        if (urls.length === 0 && urlGenerator === null) return undefined; // no usable url

        const sId = sessionId ?? md5((Math.random() * 10 ** 6).toString()); // generate a session id if not provided
        if (urlGenerator) return await urlGenerator(sId); // use the generator, if provided

        // use the array of urls. Each url could be a template containing ':sessionId' to be replaced
        const selectedTemplate = this._proxyUrls[Math.floor(Math.random() * this._proxyUrls.length)]; // randomly pick one from the array
        return selectedTemplate.replace(':sessionId', sId); // fill in the ':sessionId'
    }

    constructor(
        params: {
            proxyUrls?: string | string[];
            cookies?: { [key: string]: string };
            proxyUrlGenerator?: (sessionId?: string | undefined | null) => Promise<string | undefined>;
        } = {},
    ) {
        this._proxyUrls = typeof params.proxyUrls === 'string' ? [params.proxyUrls] : params.proxyUrls || [];
        this._proxyUrlGenerator = params.proxyUrlGenerator ?? null;
        this._cookies = params.cookies || {};
    }
}


const SORT_BY_MAP: Record<string, string> = {
    relevance: 'A',
    upload_date: 'I',
    view_count: 'M',
    rating: 'E'
};

const RESULTS_TYPE_MAP: Record<string, [string, string]> = {
    video: ['B', 'videoRenderer'],
    channel: ['C', 'channelRenderer'],
    playlist: ['D', 'playlistRenderer'],
    movie: ['E', 'videoRenderer']
};

type SortBy = "relevance" | "upload_date" | "view_count" | "rating";
type ResultType = "video" | "channel" | "playlist" | "movie";

function extractItems(pageDataContents: any): { [key in string]: any }[] {
    let isVideoMatch = (data:  { node: ObjNode, parentKey?: string | null }) => {
        let {node, parentKey} = data;
        if (Array.isArray(node)) return false;
        if (typeof node !== 'object' || node === null) return false;
        const lowercasedKeys = Object.keys(node).map((key) => key.toLowerCase());
        const hasVideoId =
            lowercasedKeys.includes('videoId'.toLowerCase()) ||
            lowercasedKeys.includes('video_id'.toLowerCase());
        const hasThumbnail =
            lowercasedKeys.includes('thumbnail'.toLowerCase()) ||
            lowercasedKeys.includes('thumbnails'.toLowerCase());
        const hasTitle = lowercasedKeys.includes('title'.toLowerCase());
        return hasVideoId && hasThumbnail && hasTitle && parentKey === "videoRenderer";
    };

    let isChannelMatch = (data:  { node: ObjNode, parentKey?: string | null }) => {
        let {node, parentKey} = data;
        if (Array.isArray(node)) return false;
        if (typeof node !== 'object' || node === null) return false;
        const lowercasedKeys = Object.keys(node).map((key) => key.toLowerCase());
        const hasChannelId =
            lowercasedKeys.includes('channelId'.toLowerCase()) ||
            lowercasedKeys.includes('channel_id'.toLowerCase());
        const hasThumbnail =
            lowercasedKeys.includes('thumbnail'.toLowerCase()) ||
            lowercasedKeys.includes('thumbnails'.toLowerCase());
        const hasTitle = lowercasedKeys.includes('title'.toLowerCase());
        return hasChannelId && hasThumbnail && hasTitle && parentKey === "channelRenderer";
    };


    return getAllDescendantObjects({
        rootNode: pageDataContents,
        isMatch: (data) => {
            return isVideoMatch(data) || isChannelMatch(data);
        },
    });
}

