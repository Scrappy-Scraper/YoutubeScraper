export function parseYouTubeUrl(youtubeURL) {
    if (isValidYouTubeVideoUrl(youtubeURL)) {
        const videoId = extractYoutubeVideoId(youtubeURL);
        return {
            type: "video",
            id: videoId ?? "",
            cleanedUrl: `https://www.youtube.com/watch?v=${videoId}`,
        };
    }
    if (isValidYouTubeChannelUrl(youtubeURL)) {
        return {
            type: "channel",
            id: extractYoutubeChannelId(youtubeURL) ?? "",
            cleanedUrl: cleanYouTubeChannelUrl(youtubeURL),
        };
    }
    return null;
}
export const videoUrlPatterns = [
    /^youtube\.com\/watch\?v=([a-zA-Z0-9-_]+)/,
    /^youtube\.com\/watch\/([a-zA-Z0-9-_]+)/,
    /^youtu\.be\/([a-zA-Z0-9-_]+)/,
    /^youtube\.com\/embed\/([a-zA-Z0-9-_]+)/,
    /^youtube\.com\/v\/([a-zA-Z0-9-_]+)/,
    /^youtube\.com\/shorts\/([a-zA-Z0-9-_]+)/,
    /^youtube\.com\/live\/([a-zA-Z0-9-_]+)/,
    /^youtube\.com\/e\/([a-zA-Z0-9-_]+)/,
];
export function extractYoutubeVideoId(url) {
    const cleanedUrl = cleanYouTubeVideoUrl(url);
    for (const pattern of videoUrlPatterns) {
        const match = cleanedUrl.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return null;
}
export function isValidYouTubeVideoId(id) {
    return /^[\w-]+$/.test(id);
}
export function isValidYouTubeVideoUrl(url) {
    const cleanedUrl = cleanYouTubeVideoUrl(url);
    return videoUrlPatterns.some((pattern) => pattern.test(cleanedUrl));
}
export function cleanYouTubeVideoUrl(url) {
    let cleanedUrl = url.replace(/^http(s?):\/\//, ""); // remove leading "https://" and "http://";
    cleanedUrl = cleanedUrl.replace(/^(m|www)\./, ""); // remove leading "m." and "www.";
    // handle youtube-nocookie.com
    if (cleanedUrl.match(/^youtube-nocookie.com/)) {
        cleanedUrl = cleanedUrl.replace(/^youtube-nocookie.com/, "youtube.com");
    }
    // handle embed link
    if (cleanedUrl.match(/^youtube\.com\/oembed\?url=/)) {
        cleanedUrl = cleanedUrl.replace(/^youtube\.com\/oembed\?url=/, "");
        cleanedUrl = decodeURIComponent(cleanedUrl);
        cleanedUrl = cleanedUrl.replace(/^http(s?):\/\//, ""); // remove leading "https://" and "http://";
        cleanedUrl = cleanedUrl.replace(/^(m|www)\./, ""); // remove leading "m." and "www.";
    }
    // handle attribution_link
    if (cleanedUrl.match(/\/attribution_link\?/)) {
        const urlAttributes = new URL(`https://${cleanedUrl}`);
        const { searchParams } = urlAttributes;
        if (searchParams.has("u")) {
            cleanedUrl = `youtube.com/${searchParams.get("u").replace(/^\//, "")}`;
        }
        cleanedUrl = cleanedUrl.replace(/\/attribution_link\?/, "/watch?");
        cleanedUrl = decodeURIComponent(cleanedUrl);
    }
    // remove unwanted searchParams
    const urlAttributes = new URL(`https://${cleanedUrl}`);
    cleanedUrl = `${urlAttributes.hostname}${urlAttributes.pathname}`;
    if (urlAttributes.searchParams.has("v")) {
        cleanedUrl += `?v=${urlAttributes.searchParams.get("v")}`;
    }
    return cleanedUrl;
}
export const channelUrlPatterns = [
    /youtube\.com\/channel\/([a-zA-Z0-9-_]+)/,
    /youtube\.com\/@([a-zA-Z0-9-_]+)/,
    /youtube\.com\/c\/([a-zA-Z0-9-_]+)/,
    /youtube\.com\/user\/([a-zA-Z0-9-_]+)/
];
export const channelIdPatterns = [
    /channel\/([a-zA-Z0-9-_]+)/,
    /@([a-zA-Z0-9-_]+)/,
    /c\/([a-zA-Z0-9-_]+)/,
    /user\/([a-zA-Z0-9-_]+)/
];
export function extractYoutubeChannelId(url) {
    let pattern;
    let match;
    pattern = /youtube\.com\/channel\/([a-zA-Z0-9-_]+)/;
    match = url.match(pattern);
    if (match) {
        return `channel/${match[1]}`;
    }
    pattern = /youtube\.com\/@([a-zA-Z0-9-_]+)/;
    match = url.match(pattern);
    if (match) {
        return `@${match[1]}`;
    }
    pattern = /youtube\.com\/c\/([a-zA-Z0-9-_]+)/;
    match = url.match(pattern);
    if (match) {
        return `c/${match[1]}`;
    }
    pattern = /youtube\.com\/user\/([a-zA-Z0-9-_]+)/;
    match = url.match(pattern);
    if (match) {
        return `user/${match[1]}`;
    }
    pattern = /youtube\.com\/([a-zA-Z0-9-_]+)/;
    match = url.match(pattern);
    if (match) {
        return `channel/${match[1]}`;
    }
    return null;
}
export function isValidYouTubeChannelId(id) {
    return channelIdPatterns.some((pattern) => pattern.test(id));
}
export function reAdjustYouTubeChannelId(id) {
    if (!channelIdPatterns.some((pattern) => pattern.test(id)))
        return `channel/${id}`;
    return id;
}
export function isValidYouTubeChannelUrl(url) {
    return channelUrlPatterns.some((pattern) => pattern.test(url));
}
export function cleanYouTubeChannelUrl(url) {
    const channelId = extractYoutubeChannelId(url);
    return `https://www.youtube.com/${channelId}`;
}
