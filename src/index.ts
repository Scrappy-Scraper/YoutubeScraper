import axios, { AxiosRequestConfig } from 'axios';
import { md5 } from 'js-md5';
import { DOMParser } from 'xmldom';
import { HttpsProxyAgent } from 'https-proxy-agent';

const languageByPopularity = ['en', 'zh', 'hi', 'es', 'ar', 'fr', 'ja', 'ko', 'th', 'ru'];

export class VideoParser {
    get videoId(): string { return this._videoId ?? ''; }
    get channelId(): string { return this._metadata?.videoDetails?.channelId ?? ''; }
    private _videoId: string | null = null;
    private _proxyUrls: string[] = [];
    private _proxyUrlGenerator: ((sessionId?: string | undefined | null) => Promise<string | undefined>) | null;
    private _cookies: { [key: string]: string } = {};
    private _metadata: { [key in string]: any } | null = null;
    private _transcripts: Transcript[] | null = null;

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

    async load(params: { videoId: string }): Promise<{ [key in string]: any }> {
        const { videoId } = params;
        const html = await this.fetchVideoHtml(videoId);
        const apiKey = extractApiKey(html);
        const url = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
        const requestData = {
            context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
            videoId,
        };

        const makeMetaDataRequest = async () => {
            const proxyUrl = await this.getProxyUrl();
            return await makeHttpRequest({
                url,
                proxyUrl,
                method: 'POST',
                requestData: JSON.stringify(requestData),
            });
        };
        const response = await raceRequests({ generateRequest: makeMetaDataRequest, amount: 3, waitTime: 5 });
        let metaData: { [key in string]: any } = JSON.parse(response.text);

        const { playabilityStatus } = metaData;
        if (playabilityStatus && playabilityStatus.status !== 'OK') {
            if (playabilityStatus.reason === 'This video is unavailable') {
                throw new Error(`Video ${videoId} is unavailable`);
            }
            throw new Error(`Request failed for video ${videoId}: ${playabilityStatus.reason}`);
        }

        this._videoId = videoId;
        this._metadata = metaData;
        return metaData;
    }

    async fetchTranscripts(params: { languageLimit?: number }) {
        const metadata = this._metadata;
        if (metadata === null) throw new Error('Video is not loaded');
        const languageLimit = params.languageLimit || 3;

        try {
            // Get transcript data from YouTube API
            const tracksData = metadata.captions?.playerCaptionsTracklistRenderer ?? [];
            const availableLanguages = new Set<string>(
                tracksData.captionTracks.map((track: { languageCode: string }) => track.languageCode.split('-')[0]),
            );
            const selectedLanguageCodes: Set<string> = new Set<string>();
            for (let lang of languageByPopularity) {
                if (availableLanguages.has(lang)) selectedLanguageCodes.add(lang); // from available languages, add the most popular languages into selected language
            }
            availableLanguages.forEach((languageCode) => {
                selectedLanguageCodes.add(languageCode);
            }); // add the remainder of languages

            // Parse and fetch all available transcripts
            const transcripts: Transcript[] = [];
            const captionTracks = tracksData.captionTracks || [];
            const selectedLangCodes: Set<string> = new Set<string>(Array.from(selectedLanguageCodes).slice(0, languageLimit));
            const filteringByLanguage = selectedLangCodes.size > 0;

            const fetchTasks = captionTracks.map((track: {name: {runs: {text: string}[]}, baseUrl: string, languageCode: string, kind: string}) => {
                return (async () => {
                    try {
                        const trackLanguagePrimaryCode: string = track.languageCode.split('-')[0];
                        if (filteringByLanguage && !selectedLangCodes.has(trackLanguagePrimaryCode)) return;

                        const transcriptUrl = track.baseUrl.replace('&fmt=srv3', '');
                        const makeRequest = async () => {
                            return makeHttpRequest({ url: transcriptUrl, proxyUrl: await this.getProxyUrl() });
                        };
                        const response = await raceRequests({ generateRequest: makeRequest, amount: 3, waitTime: 5 });
                        const snippets = parseTranscriptXml(response.text);

                        transcripts.push({
                            snippets,
                            language: track.name.runs[0].text,
                            language_code: track.languageCode,
                            is_generated: track.kind === 'asr',
                        });
                    } catch (error) {
                        // Skip this transcript if it fails, continue with others
                        console.warn(`Failed to fetch transcript for language ${track.languageCode}:`, error);
                    }
                })();
            });
            await Promise.allSettled(fetchTasks);
            this._transcripts = transcripts;
            return transcripts;
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Unknown error');
        }
    }

    toJSON() {
        const videoDetails = this._metadata?.videoDetails ?? {};
        const thumbnails: { url: string; width: number; height: number }[] = videoDetails.thumbnail?.thumbnails ?? [];
        thumbnails.sort((a, b) => (a.width ?? 0) - (b.width ?? 0));

        return {
            id: this._videoId ?? '',
            title: videoDetails.title ?? '',
            description: videoDetails.shortDescription ?? '',
            thumbnail: thumbnails.at(-1)?.url ?? '',
            length: videoDetails.lengthSeconds ? parseInt(videoDetails.lengthSeconds, 10) : 0,
            viewCount: videoDetails.viewCount ? parseInt(videoDetails.viewCount, 10) : 0,
            channelId: videoDetails.channelId ?? '',
            author: videoDetails.author ?? '',
            isPrivate: videoDetails.isPrivate ?? false,
            transcripts: this._transcripts ?? [],
        };
    }

    private async getProxyUrl(sessionId: string | undefined | null = undefined): Promise<string | undefined> {
        const urls = this._proxyUrls ?? [];
        const urlGenerator = this._proxyUrlGenerator ?? null;

        if (urls.length === 0 && urlGenerator === null) return undefined; // no usable url

        if (urlGenerator) return await urlGenerator(sessionId); // use the generator, if provided

        // use the array of urls. Each url could be a template containing ':sessionId' to be replaced
        const selectedTemplate = this._proxyUrls[Math.floor(Math.random() * this._proxyUrls.length)]; // randomly pick one from the array
        const sId = sessionId ?? md5((Math.random() * 10 ** 6).toString()); // generate a session id if not provided
        return selectedTemplate.replace(':sessionId', sId); // fill in the ':sessionId'
    }

    private async fetchVideoHtml(videoId: string): Promise<string> {
        const url = `https://www.youtube.com/watch?v=${videoId}`;

        try {
            const response = await raceRequests({
                generateRequest: async () => makeHttpRequest({ url, proxyUrl: await this.getProxyUrl() }),
                amount: 3,
                waitTime: 5,
            });
            let html = unescapeHtml(response.text);
            const { proxyUrl } = response;

            // Handle consent cookie if needed
            if (html.includes('action="https://consent.youtube.com/s"')) {
                const match = html.match(/name="v" value="(.*?)"/);
                if (match) {
                    // Set consent cookie and retry
                    this._cookies.CONSENT = `YES+${match[1]}`;
                    const retryResponse = await makeHttpRequest({
                        url,
                        proxyUrl,
                        headers: {
                            Cookie: Object.entries(this._cookies)
                                .map(([k, v]) => `${k}=${v}`)
                                .join('; '),
                        },
                    });
                    html = unescapeHtml(retryResponse.text);
                }
            }

            return html;
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : `Failed to fetch video HTML: ${error}`);
        }
    }
}

export class ChannelParser {
    get videos(): ListVideoInfo[] { return Array.from(this._videos.values()); }
    get channelId(): string { return this._metadata?.id ?? ''; }
    private _channelId: string | null = null;
    private _proxyUrls: string[] = []; // list of available proxy urls to choose from
    private _proxyUrlGenerator: ((sessionId?: string | undefined | null) => Promise<string | undefined>) | null;
    private _metadata: ChannelMetadata | null = null;
    private _videos: Map<string, { videoId: string; thumbnail: string; title: string }> = new Map<
        string,
        { videoId: string; thumbnail: string; title: string }
    >();
    private _headers: { [key: string]: string } = {};
    private static apiEndpoint: string = 'https://www.youtube.com/youtubei/v1/browse';
    private _proxyUrl: string | null = null; // the proxy url that got chosen
    private _apiKey: string | null = null;
    private _requestClientData: any | null = null;
    private _nextPageAccessData: any | null = null;

    constructor(
        params: {
            proxyUrls?: string | string[];
            cookies?: { [key: string]: string };
            proxyUrlGenerator?: (sessionId?: string | undefined | null) => Promise<string | undefined>;
        } = {},
    ) {
        this._proxyUrls = typeof params.proxyUrls === 'string' ? [params.proxyUrls] : params.proxyUrls || [];
        this._proxyUrlGenerator = params.proxyUrlGenerator ?? null;
    }

    async load(params: { channelId: string }) {
        if (this._channelId !== null) throw new Error('Channel is already loaded');
        const baseUrl = `https://www.youtube.com/channel/${params.channelId}`;

        const url = `${baseUrl}/videos?view=0&flow=grid&ucbcb=1`;

        const makeMetaDataRequest = async () => {
            const proxyUrl = await this.getProxyUrl();
            return await makeHttpRequest({ url, proxyUrl, method: 'GET' });
        };
        let response = await raceRequests({ generateRequest: makeMetaDataRequest, amount: 3, waitTime: 5 });
        this._proxyUrl = response.proxyUrl;
        let html = unescapeHtml(response.text);
        this._apiKey = extractApiKey(html);

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
            if (typeof newVid !== 'object' || newVid == null) continue;
            let vId = newVid.videoId ?? null;
            if (this._videos.has(vId)) continue;
            this._videos.set(vId, newVid);
        }
        this._nextPageAccessData = ChannelParser.getNextPageAccessData(pageData);

        return Array.from(this._videos.values());
    }

    async fetchMoreVideos() {
        const response = await makeHttpRequest({
            url: `${ChannelParser.apiEndpoint}?key=${this._apiKey}`,
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
        this._nextPageAccessData = ChannelParser.getNextPageAccessData(contents);
        const newVideos = ChannelParser.extractVideos(contents).map((v) => ChannelParser.parseVideoData(v));
        for (let newVid of newVideos) {
            if (typeof newVid !== 'object' || newVid == null) continue;
            let vId = newVid.videoId ?? null;
            if (this._videos.has(vId)) continue;
            this._videos.set(vId, newVid);
        }

        return newVideos;
    }

    hasMoreVideos() {
        return this._nextPageAccessData !== null;
    }

    toJSON(): { [key in string]: any } {
        return {
            ...this._metadata,
            videos: Array.from(this._videos.values()),
        };
    }

    private async getProxyUrl(sessionId: string | undefined | null = undefined): Promise<string | undefined> {
        const urls = this._proxyUrls ?? [];
        const urlGenerator = this._proxyUrlGenerator ?? null;

        if (urls.length === 0 && urlGenerator === null) return undefined; // no usable url

        if (urlGenerator) return await urlGenerator(sessionId); // use the generator, if provided

        // use the array of urls. Each url could be a template containing ':sessionId' to be replaced
        const selectedTemplate = this._proxyUrls[Math.floor(Math.random() * this._proxyUrls.length)]; // randomly pick one from the array
        const sId = sessionId ?? md5((Math.random() * 10 ** 6).toString()); // generate a session id if not provided
        return selectedTemplate.replace(':sessionId', sId); // fill in the ':sessionId'
    }

    private static parseVideoData(data: { [key in string]: any }): ListVideoInfo {
        const { videoId } = data;
        const title = data.title.runs[0].text;
        const thumbnail = data.thumbnail.thumbnails[0].url;
        return { videoId, title, thumbnail };
    }

    static getNextPageAccessData(data: any, sortBy?: string) {
        const sortByPositions: Record<string, number> = { newest: 0, popular: 1, oldest: 2 };
        let endpoint: any;

        if (sortBy && sortBy !== 'newest') {
            const feedFilter = findInObject(data, 'feedFilterChipBarRenderer');
            if (feedFilter && feedFilter.contents) {
                const chip = feedFilter.contents[sortByPositions[sortBy]];
                endpoint = chip?.chipCloudChipRenderer?.navigationEndpoint;
            }
        } else {
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

    static extractVideos(pageDataContents: any): { [key in string]: any }[] {
        return getAllDescendantObjects({
            rootNode: pageDataContents,
            isMatch: (data) => {
                let { node, parentKey } = data;
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
                return hasVideoId && hasThumbnail && hasTitle;
            },
        });
    }
}

async function raceRequests(params: {
    generateRequest: () => Promise<any>;
    amount: number;
    waitTime?: number; // time in seconds
}) {
    const { generateRequest, amount, waitTime } = params;
    if (amount === 0) throw new Error('Amount of requests must be greater than 0');

    const tasks: Promise<any>[] = [];
    let isDone = false;
    for (let ind = 0; ind < amount; ind++) {
        if (isDone) break; // if one of the existing is done successfully, stop adding new tasks
        const task = generateRequest();
        tasks.push(task);
        task
            .then(() => {
                isDone = true;
            }).catch(() => {});
        if (waitTime) { // time to wait before adding another request
            await new Promise((resolve) => {
                setTimeout(resolve, waitTime * 1000);
            });
        }
    }
    return Promise.any(tasks);
}

async function makeHttpRequest(params: {
    url: string;
    proxyUrl?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'CONNECT' | 'TRACE';
    requestData?: string;
    headers?: any;
    timeout?: number;
}): Promise<{ text: string; status: number; proxyUrl?: string }> {
    const { url, proxyUrl, method = 'GET', requestData, headers = {}, timeout = 30000 } = params;

    try {
        // Prepare axios config
        const axiosConfig: AxiosRequestConfig = {
            url,
            method,
            timeout,
            headers: {
                'Accept-Language': 'en-US',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                ...headers,
            },
            // Disable automatic response validation to handle non-2xx status codes manually
            validateStatus: () => true,
        };

        // Add request data for POST/PUT methods
        if (requestData) {
            axiosConfig.data = requestData;
            axiosConfig.headers!['Content-Type'] = axiosConfig.headers!['Content-Type'] || 'application/json';
        }

        // Handle proxy configuration
        if (proxyUrl) {
            axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
        }

        // Make the request
        const response = await axios(axiosConfig);

        // Handle HTTP error status codes
        if (response.status >= 400) {
            throw new Error(`HTTP ${response.status}: ${response.data}`);
        }

        return {
            text: (typeof response.data === 'string') ? response.data : JSON.stringify(response.data),
            status: response.status,
            proxyUrl,
        };
    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                throw new Error('Request timeout');
            }
            if (error.response) {
                throw new Error(`HTTP ${error.response.status}`);
            }
            throw new Error(error.message);
        }
        throw error;
    }
}

function extractApiKey(html: string): string {
    const pattern = /"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/;
    const match = html.match(pattern);

    if (!match || !match[1]) throw new Error('Could not extract API key from video page');

    return match[1];
}

function parseTranscriptXml(xmlText: string): TranscriptSnippet[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const elements = Array.from(doc.documentElement.childNodes);
    const htmlRegex = /<[^>]*>/gi;

    return elements
        .filter((element) => element.nodeType === 1 && element.textContent)
        .map((element) => {
            const el = element as any;
            const text = el.textContent || '';
            const cleanText = unescapeHtml(text.replace(htmlRegex, ''));

            return {
                text: cleanText,
                start: parseFloat(el.getAttribute('start') || '0'),
                duration: parseFloat(el.getAttribute('dur') || '0'),
            };
        });
}

function unescapeHtml(text: string): string {
    const entities: { [key: string]: string } = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&#39;': "'",
        '&#x27;': "'",
        '&#x2F;': '/',
        '&#x60;': '`',
        '&#x3D;': '=',
    };

    return text.replace(/&[a-zA-Z0-9#]+;/g, (match) => {
        return entities[match] || match;
    });
}

// Extract JSON data from HTML. Keep in mind this is prone to failure so please be ready to handle it with fallback
function getJsonFromHtml(html: string, key: string, numChars: number = 2, stop: string = '"'): string {
    const startPos = html.indexOf(key) + key.length + numChars;
    const endPos = html.indexOf(stop, startPos);
    return html.substring(startPos, endPos);
}

// Find a specific key in nested object
function findInObject(obj: any, searchKey: string): any {
    const queue: any[] = [obj];

    while (queue.length > 0) {
        const current = queue.shift();

        if (current && typeof current === 'object') {
            if (Array.isArray(current)) {
                queue.push(...current);
            } else {
                for (const [key, value] of Object.entries(current)) {
                    if (key === searchKey) {
                        return value;
                    }
                    queue.push(value);
                }
            }
        }
    }

    return null;
}

export function getAllDescendantObjects(params: {
    rootNode: ObjNode;
    isMatch: (params: { node: ObjNode; parentKey?: string | null }) => boolean;
    parentKey?: string | null | undefined;
}): { [key in string]: any }[] {
    const { rootNode, isMatch, parentKey = null } = params;

    if (Array.isArray(rootNode)) {
        return rootNode.flatMap((node) => getAllDescendantObjects({ rootNode: node, isMatch, parentKey }));
    }

    if (typeof rootNode !== 'object' || rootNode === null) return [];

    const descendantNodes: { [key in string]: any }[] = [];
    for (const [key, value] of Object.entries(rootNode)) {
        // go over this root node's children
        const matched = isMatch({
            node: value,
            parentKey,
        });
        if (matched) descendantNodes.push(value);
        descendantNodes.push(...getAllDescendantObjects({ rootNode: value, isMatch, parentKey: key }));
    }
    return descendantNodes;
}
type ObjNode = { [key in string]: any } | ObjNode[] | number | boolean | string | null | undefined;

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

type ChannelMetadata = {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    rssUrl: string;
    channelUrl: string;
    vanityChannelUrl: string;
};
