import { DOMParser } from "xmldom";
import { makeHttpRequest, raceRequests, unescapeHtml } from "./utils.js";
import { md5 } from "js-md5";
import extractInnerTubeApiKeyFromHtml from "./extractInnerTubeApiKeyFromHtml.js";
const languageByPopularity = ['en', 'zh', 'hi', 'es', 'ar', 'fr', 'ja', 'ko', 'th', 'ru'];
export default class VideoParser {
    get videoId() {
        return this._videoId ?? '';
    }
    get channelId() {
        return this._metadata?.videoDetails?.channelId ?? '';
    }
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
        const apiKey = extractInnerTubeApiKeyFromHtml(html);
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
