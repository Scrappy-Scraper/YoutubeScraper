import axios from 'axios';
import { md5 } from 'js-md5';
import { DOMParser } from 'xmldom';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { reAdjustYouTubeChannelId } from "./YouTubeUrl.js";
const languageByPopularity = ['en', 'zh', 'hi', 'es', 'ar', 'fr', 'ja', 'ko', 'th', 'ru'];
const sleepAsync = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export class VideoParser {
    get videoId() { return this._videoId ?? ''; }
    get channelId() { return this._metadata?.videoDetails?.channelId ?? ''; }
    get availableCaptions() {
        return (this._metadata?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []).map((t) => ({
            name: t.name?.runs[0].text,
            languageCode: t.languageCode ?? "",
            isGenerated: (t.kind ?? "").toLowerCase() === 'asr',
        })) ?? [];
    }
    _videoId = null;
    _proxyUrls = [];
    _proxyUrlGenerator;
    _cookies = {};
    _metadata = null;
    _transcripts = null;
    constructor(params = {}) {
        this._proxyUrls = typeof params.proxyUrls === 'string' ? [params.proxyUrls] : params.proxyUrls || [];
        this._proxyUrlGenerator = params.proxyUrlGenerator ?? null;
        this._cookies = params.cookies || {};
    }
    async load(params) {
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
        let metaData = JSON.parse(response.text);
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
    async fetchTranscripts(params) {
        const metadata = this._metadata;
        if (metadata === null)
            throw new Error('Video is not loaded');
        let languageLimit = params.languageLimit || 3;
        if (languageLimit === -1)
            languageLimit = undefined;
        try {
            // Get transcript data from YouTube API
            const tracksData = metadata.captions?.playerCaptionsTracklistRenderer ?? [];
            const availableLanguages = new Set(tracksData.captionTracks.map((track) => track.languageCode.split('-')[0]));
            const selectedLanguageCodes = new Set();
            for (let lang of languageByPopularity) {
                if (availableLanguages.has(lang))
                    selectedLanguageCodes.add(lang); // from available languages, add the most popular languages into selected language
            }
            availableLanguages.forEach((languageCode) => {
                selectedLanguageCodes.add(languageCode);
            }); // add the remainder of languages
            // Parse and fetch all available transcripts
            const transcripts = [];
            const captionTracks = tracksData.captionTracks || [];
            const selectedLangCodes = new Set(Array.from(selectedLanguageCodes).slice(0, languageLimit));
            const filteringByLanguage = selectedLangCodes.size > 0;
            const fetchTasks = captionTracks.map((track) => {
                return (async () => {
                    try {
                        const trackLanguagePrimaryCode = track.languageCode.split('-')[0];
                        if (filteringByLanguage && !selectedLangCodes.has(trackLanguagePrimaryCode))
                            return;
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
                    }
                    catch (error) {
                        // Skip this transcript if it fails, continue with others
                        console.warn(`Failed to fetch transcript for language ${track.languageCode}:`, error);
                    }
                })();
            });
            await Promise.allSettled(fetchTasks);
            this._transcripts = transcripts;
            return transcripts;
        }
        catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Unknown error');
        }
    }
    toJSON() {
        const videoDetails = this._metadata?.videoDetails ?? {};
        const thumbnails = videoDetails.thumbnail?.thumbnails ?? [];
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
    async fetchVideoHtml(videoId) {
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
        }
        catch (error) {
            throw new Error(error instanceof Error ? error.message : `Failed to fetch video HTML: ${error}`);
        }
    }
}
export class ChannelParser {
    get videos() { return Array.from(this._videos.values()); }
    get channelId() { return this._metadata?.id ?? ''; }
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
async function raceRequests(params) {
    const { generateRequest, amount, waitTime } = params;
    if (amount === 0)
        throw new Error('Amount of requests must be greater than 0');
    const tasks = [];
    let isDone = false;
    for (let ind = 0; ind < amount; ind++) {
        if (isDone)
            break; // if one of the existing is done successfully, stop adding new tasks
        const task = generateRequest();
        tasks.push(task);
        task
            .then(() => {
            isDone = true;
        }).catch(() => { });
        if (waitTime) { // time to wait before adding another request
            await new Promise((resolve) => {
                setTimeout(resolve, waitTime * 1000);
            });
        }
    }
    return Promise.any(tasks);
}
async function makeHttpRequest(params) {
    const { url, proxyUrl, method = 'GET', requestData, headers = {}, timeout = 30000 } = params;
    try {
        // Prepare axios config
        const axiosConfig = {
            url,
            method,
            timeout,
            headers: {
                'Accept-Language': 'en-US',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                ...headers,
            },
            // Disable automatic response validation to handle non-2xx status codes manually
            validateStatus: () => true,
        };
        // Add request data for POST/PUT methods
        if (requestData) {
            axiosConfig.data = requestData;
            axiosConfig.headers['Content-Type'] = axiosConfig.headers['Content-Type'] || 'application/json';
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
    }
    catch (error) {
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
function extractApiKey(html) {
    const pattern = /"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/;
    const match = html.match(pattern);
    if (!match || !match[1])
        throw new Error('Could not extract API key from video page');
    return match[1];
}
function parseTranscriptXml(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const elements = Array.from(doc.documentElement.childNodes);
    const htmlRegex = /<[^>]*>/gi;
    return elements
        .filter((element) => element.nodeType === 1 && element.textContent)
        .map((element) => {
        const el = element;
        const text = el.textContent || '';
        const cleanText = unescapeHtml(text.replace(htmlRegex, ''));
        return {
            text: cleanText,
            start: parseFloat(el.getAttribute('start') || '0'),
            duration: parseFloat(el.getAttribute('dur') || '0'),
        };
    });
}
function unescapeHtml(text) {
    const entities = {
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
function getJsonFromHtml(html, key, numChars = 2, stop = '"') {
    const startPos = html.indexOf(key) + key.length + numChars;
    const endPos = html.indexOf(stop, startPos);
    return html.substring(startPos, endPos);
}
// Find a specific key in nested object
function findInObject(obj, searchKey) {
    const queue = [obj];
    while (queue.length > 0) {
        const current = queue.shift();
        if (current && typeof current === 'object') {
            if (Array.isArray(current)) {
                queue.push(...current);
            }
            else {
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
export function getAllDescendantObjects(params) {
    const { rootNode, isMatch, parentKey = null } = params;
    if (Array.isArray(rootNode)) {
        return rootNode.flatMap((node) => getAllDescendantObjects({ rootNode: node, isMatch, parentKey }));
    }
    if (typeof rootNode !== 'object' || rootNode === null)
        return [];
    const descendantNodes = [];
    for (const [key, value] of Object.entries(rootNode)) {
        // go over this root node's children
        const matched = isMatch({
            node: value,
            parentKey,
        });
        if (matched)
            descendantNodes.push(value);
        descendantNodes.push(...getAllDescendantObjects({ rootNode: value, isMatch, parentKey: key }));
    }
    return descendantNodes;
}
export class PromiseQueue {
    _concurrency = 3; // number of tasks that can be in-progress at the same time
    get concurrency() { return this._concurrency; }
    set concurrency(value) { this._concurrency = Math.max(1, value); }
    reAdjustTaskId = ((id) => id);
    // worker is the function that process the data
    set worker(value) {
        this._makeWorkerTask = value;
    }
    _queue = new Map(); // {taskId: taskData} // tasks to be taken
    _inProgressTaskDataSet = new Map(); // {taskId: taskData} // tasks in-progress
    _succeededTaskIds = new Map(); // ids of tasks that are done and succeeded. The key is the task id and val is the added time in Unix Epoch seconds
    _successIdsExpiry = 10 * 60; // time in seconds
    _failedTaskIds = new Map(); // ids of tasks that are done and failed. The key is the task id and val is the added time in Unix Epoch seconds
    _failureIdsExpiry = 10 * 60; // time in seconds
    get _allTaskIds() {
        return new Set([
            ...this._queue.keys(),
            ...this._inProgressTaskDataSet.keys(),
            ...this._succeededTaskIds.keys(),
            ...this._failedTaskIds.keys(),
        ]);
    }
    _isIdOnRecord(id) {
        return this._queue.has(id) || this._inProgressTaskDataSet.has(id) || this._succeededTaskIds.has(id) || this._failedTaskIds.has(id);
    }
    get stats() {
        return {
            pending: Array.from(this._queue.keys()),
            inProgress: Array.from(this._inProgressTaskDataSet.keys()),
            succeeded: Array.from(this._succeededTaskIds.keys()),
            failed: Array.from(this._failedTaskIds.keys()),
        };
    }
    onTaskSuccess = (() => { });
    onTaskFail = (() => { });
    onTaskStart = (() => { });
    _makeWorkerTask = null;
    async allDone() {
        let isAllDone = false;
        while (!isAllDone) {
            isAllDone = this._queue.size === 0 && this._inProgressTaskDataSet.size === 0;
            await new Promise(resolve => { setTimeout(resolve, 100); });
        }
    }
    enqueue(params) {
        let { taskData, taskId, logTaskAddedWarning = false } = params;
        if ((taskId ?? null) === null)
            throw new Error(`taskId is required`);
        taskId = this.reAdjustTaskId(taskId);
        // if added previously, don't add
        let isIdOnRecord = this._isIdOnRecord(taskId);
        if (isIdOnRecord) { // if the id is on the record
            this._removeExpiredHistoryIds(); // remove all the expired ids
            isIdOnRecord = this._isIdOnRecord(taskId); // check again
        }
        if (isIdOnRecord) {
            if (!logTaskAddedWarning)
                return;
            if (this._queue.has(taskId))
                console.warn(`⏭️ Task with id ${taskId} already exists in the queue, so it's not added again`);
            if (this._inProgressTaskDataSet.has(taskId))
                console.warn(`⏭️ Task with id ${taskId} is already in progress, so it's not added again`);
            if (this._succeededTaskIds.has(taskId))
                console.warn(`⏭️ Task with id ${taskId} had already been worked on, so it's not added again. That task succeeded`);
            if (this._failedTaskIds.has(taskId))
                console.warn(`⏭️ Task with id ${taskId} had already been worked on, so it's not added again. That task failed`);
            return;
        }
        // add task to the queue
        this._queue.set(taskId, taskData);
        // put task to work
        this._deployWorkers();
    }
    // take out and return the oldest item in the queue
    _dequeue() {
        const taskId = Array.from(this._queue.keys()).shift() ?? null;
        if (taskId === null)
            return null;
        const taskData = this._queue.get(taskId);
        this._queue.delete(taskId);
        return { taskData, taskId };
    }
    _deployWorkers() {
        while (this._queue.size > 0 && // still has pending tasks on queue
            this._inProgressTaskDataSet.size < this._concurrency // can still add more tasks to in_progress
        ) {
            if (this._makeWorkerTask === null)
                throw new Error(`PromiseQueue worker is not set. Please set it with PromiseQueue.worker = (taskData, taskId) => Promise<TaskResponseData>`);
            const nextTask = this._dequeue(); // take out next pending task from the queue to work on
            if (nextTask === null)
                return; // if no pending task left to work on, return
            const { taskData, taskId } = nextTask;
            this._inProgressTaskDataSet.set(taskId, taskData); // record that task as in_progress
            // callbacks
            const baseCallbackData = { taskData, taskId, promiseQueue: this };
            this.onTaskStart(baseCallbackData);
            (async () => {
                let responseData;
                try {
                    responseData = await this._makeWorkerTask(taskData, taskId); // create the task worker
                    this._succeededTaskIds.set(taskId, (new Date).getTime() / 1000); // record it as succeeded
                    this.onTaskSuccess({ taskResponse: responseData, ...baseCallbackData }); // call the callback function
                }
                catch (error) {
                    this._failedTaskIds.set(taskId, (new Date).getTime() / 1000); // record it as failed
                    this.onTaskFail({ error, ...baseCallbackData }); // call the callback function
                }
                this._inProgressTaskDataSet.delete(taskId); // remove from list of in_progress tasks
                this._deployWorkers(); // put remaining queued tasks to in_progress
            })();
        }
    }
    _removeExpiredHistoryIds() {
        const now = (new Date).getTime() / 1000;
        for (const [id, addedTime] of this._succeededTaskIds) {
            if (now - addedTime > this._successIdsExpiry)
                this._succeededTaskIds.delete(id);
        }
        for (const [id, addedTime] of this._failedTaskIds) {
            if (now - addedTime > this._failureIdsExpiry)
                this._failedTaskIds.delete(id);
        }
    }
}
