import { reAdjustYouTubeChannelId } from "./YouTubeUrl.js";
import { findInObject, getAllDescendantObjects, getJsonFromHtml, makeHttpRequest, raceRequests, unescapeHtml } from "./utils.js";
import extractInnerTubeApiKeyFromHtml from "./extractInnerTubeApiKeyFromHtml.js";
import { md5 } from "js-md5";
export default class ChannelParser {
    get videos() {
        return Array.from(this._videos.values());
    }
    get channelId() {
        return this._metadata?.id ?? '';
    }
    _channelId = null;
    _proxyUrls = []; // list of available proxy urls to choose from
    _proxyUrlGenerator;
    _metadata = null;
    _videos = new Map();
    _headers = {};
    static apiEndpoint = 'https://www.youtube.com/youtubei/v1/browse';
    _proxyUrl = null; // the proxy url that got chosen
    _apiKey = null;
    _requestClientData = null;
    _nextPageAccessData = null;
    constructor(params = {}) {
        this._proxyUrls = typeof params.proxyUrls === 'string' ? [params.proxyUrls] : params.proxyUrls || [];
        this._proxyUrlGenerator = params.proxyUrlGenerator ?? null;
    }
    async load(params) {
        if (this._channelId !== null)
            return; // channel already loaded
        const channelId = reAdjustYouTubeChannelId(params.channelId);
        let baseUrl = `https://www.youtube.com/${channelId}`;
        const url = `${baseUrl}/videos?view=0&flow=grid&ucbcb=1`;
        const makeMetaDataRequest = async () => {
            const proxyUrl = await this.getProxyUrl();
            return await makeHttpRequest({ url, proxyUrl, method: 'GET' });
        };
        let response = await raceRequests({ generateRequest: makeMetaDataRequest, amount: 3, waitTime: 5 });
        this._proxyUrl = response.proxyUrl;
        let html = unescapeHtml(response.text);
        this._apiKey = extractInnerTubeApiKeyFromHtml(html);
        // extract info about the requesting client
        this._requestClientData = JSON.parse(`${getJsonFromHtml(html, 'INNERTUBE_CONTEXT', 2, '"}},')}"}}`);
        this._headers = {
            'X-YouTube-Client-Name': '1',
            'X-YouTube-Client-Version': this._requestClientData?.client?.clientVersion ?? '',
        };
        let pageData = JSON.parse(`${getJsonFromHtml(html, 'var ytInitialData = ', 0, '};')}}`);
        let contents = findInObject(pageData, 'contents');
        const channelRawMetadata = pageData.metadata.channelMetadataRenderer ?? {};
        this._metadata = {
            id: channelRawMetadata.externalId ?? '',
            title: channelRawMetadata.title ?? '',
            description: channelRawMetadata.description ?? '',
            thumbnail: channelRawMetadata.avatar.thumbnails[0] ?? '',
            rssUrl: channelRawMetadata.rssUrl ?? '',
            channelUrl: channelRawMetadata.channelUrl ?? '',
            vanityChannelUrl: channelRawMetadata.vanityChannelUrl ?? '',
        };
        let newVideos = ChannelParser.extractVideos(contents).map((v) => ChannelParser.parseVideoData(v));
        for (let newVid of newVideos) {
            if (typeof newVid !== 'object' || newVid == null)
                continue;
            let vId = newVid.videoId ?? null;
            if (this._videos.has(vId))
                continue;
            this._videos.set(vId, newVid);
        }
        this._nextPageAccessData = ChannelParser.getNextPageAccessData(pageData);
        this._channelId = this._metadata.id;
    }
    async fetchMoreVideos() {
        const response = await makeHttpRequest({
            url: `${ChannelParser.apiEndpoint}?key=${this._apiKey}`,
            proxyUrl: this._proxyUrl,
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
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                'Accept-Language': 'en',
            },
        });
        const contents = JSON.parse(response.text);
        this._nextPageAccessData = ChannelParser.getNextPageAccessData(contents);
        const newVideos = ChannelParser.extractVideos(contents).map((v) => ChannelParser.parseVideoData(v));
        for (let newVid of newVideos) {
            if (typeof newVid !== 'object' || newVid == null)
                continue;
            let vId = newVid.videoId ?? null;
            if (this._videos.has(vId))
                continue;
            this._videos.set(vId, newVid);
        }
        return newVideos;
    }
    hasMoreVideos() {
        return this._nextPageAccessData !== null;
    }
    toJSON() {
        return {
            ...this._metadata,
            videos: Array.from(this._videos.values()),
        };
    }
    async getProxyUrl(sessionId = undefined) {
        const urls = this._proxyUrls ?? [];
        const urlGenerator = this._proxyUrlGenerator ?? null;
        if (urls.length === 0 && urlGenerator === null)
            return undefined; // no usable url
        if (urlGenerator)
            return await urlGenerator(sessionId); // use the generator, if provided
        // use the array of urls. Each url could be a template containing ':sessionId' to be replaced
        const selectedTemplate = this._proxyUrls[Math.floor(Math.random() * this._proxyUrls.length)]; // randomly pick one from the array
        const sId = sessionId ?? md5((Math.random() * 10 ** 6).toString()); // generate a session id if not provided
        return selectedTemplate.replace(':sessionId', sId); // fill in the ':sessionId'
    }
    static parseVideoData(data) {
        const { videoId } = data;
        const title = data.title.runs[0].text;
        const thumbnail = data.thumbnail.thumbnails[0].url;
        return { videoId, title, thumbnail };
    }
    static getNextPageAccessData(data, sortBy) {
        const sortByPositions = { newest: 0, popular: 1, oldest: 2 };
        let endpoint;
        if (sortBy && sortBy !== 'newest') {
            const feedFilter = findInObject(data, 'feedFilterChipBarRenderer');
            if (feedFilter && feedFilter.contents) {
                const chip = feedFilter.contents[sortByPositions[sortBy]];
                endpoint = chip?.chipCloudChipRenderer?.navigationEndpoint;
            }
        }
        else {
            endpoint = findInObject(data, 'continuationEndpoint');
        }
        if (!endpoint) {
            return null;
        }
        return {
            token: endpoint.continuationCommand.token,
            clickParams: { clickTrackingParams: endpoint.clickTrackingParams },
        };
    }
    static extractVideos(pageDataContents) {
        return getAllDescendantObjects({
            rootNode: pageDataContents,
            isMatch: (data) => {
                let { node, parentKey } = data;
                if (Array.isArray(node))
                    return false;
                if (typeof node !== 'object' || node === null)
                    return false;
                const lowercasedKeys = Object.keys(node).map((key) => key.toLowerCase());
                const hasVideoId = lowercasedKeys.includes('videoId'.toLowerCase()) ||
                    lowercasedKeys.includes('video_id'.toLowerCase());
                const hasThumbnail = lowercasedKeys.includes('thumbnail'.toLowerCase()) ||
                    lowercasedKeys.includes('thumbnails'.toLowerCase());
                const hasTitle = lowercasedKeys.includes('title'.toLowerCase());
                return hasVideoId && hasThumbnail && hasTitle;
            },
        });
    }
}
