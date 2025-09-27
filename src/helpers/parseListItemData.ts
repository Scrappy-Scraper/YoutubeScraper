import {ListVideoInfo} from "../type/ListVideoInfo.js";
import {ListChannelInfo} from "../type/ListChannelInfo.js";
import {fallbackValue, findInObject} from "../utils.js";
import {parseAgeText, TimeUnit} from "./parseAgeText.js";

export default function parseListItemData(data: { [key in string]: any }): ListVideoInfo | ListChannelInfo | null {
    if (data.hasOwnProperty("videoId")) return parseListVideoItemData(data);
    if (data.hasOwnProperty("channelId")) return parseListChannelItemData(data);
    return null;
}

function parseListVideoItemData(data: { [key in string]: any }): ListVideoInfo {
    const {videoId} = data;
    const title = data.title.runs[0].text;
    const thumbnail = data.thumbnail.thumbnails[0].url;

    // view count
    let viewCount: number | undefined = parseInt((data.viewCountText?.simpleText ?? "").toLowerCase().replaceAll(",", "").replaceAll(".", "").replaceAll("views").trim());
    if (isNaN(viewCount)) viewCount = undefined;

    // length (in seconds)
    let lengthText = data.lengthText?.simpleText ?? null;
    let length: number | undefined = undefined;
    if (lengthText) {
        let lengthParts = lengthText.split(":");
        if (lengthParts.length === 2) {
            length = parseInt(lengthParts[0]) * 60 + parseInt(lengthParts[1]);
        } else if (lengthParts.length === 3) {
            length = parseInt(lengthParts[0]) * 3600 + parseInt(lengthParts[1]) * 60 + parseInt(lengthParts[2]);
        } else if (lengthParts.length === 4) {
            length = parseInt(lengthParts[0]) * 86400 + parseInt(lengthParts[1]) * 3600 + parseInt(lengthParts[2]) * 60 + parseInt(lengthParts[3]);
        } else {
            length = undefined;
        }
    }

    // age
    let age: { amount: number, unit: TimeUnit } | undefined = undefined;
    let ageText = data.publishedTimeText?.simpleText ?? null;
    if (ageText) {
        age = parseAgeText(ageText);
    }

    let {thumbnailUrl: channelThumbnail, channelId, channelName} = parseVideoChannelData(data);

    return {type: "video", id: videoId, title, thumbnail, viewCount, length, age, channelThumbnail, channelId, channelName};
}
function parseVideoChannelData(data: { [key in string]: any }) {
    let thumbnailUrl: string|null = null;

    // extract channel thumbnail url from "channelThumbnailWithLinkRenderer" node
    let channelThumbnailData = findInObject(data, "channelThumbnailWithLinkRenderer") ?? {};
    let thumbnails = findInObject(channelThumbnailData, "thumbnails") ?? [];
    thumbnailUrl = thumbnails[0]?.url ?? null;

    // if thumbnailUrl not found, try "avatar" node
    let avatar = findInObject(data, "avatar") ?? {};
    if(thumbnailUrl === null) {
        let avatarViewModel = findInObject(avatar, "avatarViewModel") ?? {};
        let sources = findInObject(avatarViewModel, "sources") ?? [];
        thumbnailUrl = sources[0]?.url ?? null;
    }

    let parseChannelIdFromUrl = function(url: string) {
        if(url.includes("channel/")) return url.split("/").at(-1) ?? null;
        return null;
    }

    let channelId: string | null = null;
    let channelName: string | null = null;

    // get channelId from "longBylineText" node
    let longBylineText = ((findInObject(data, "longBylineText") ?? {}).runs ?? [])[0] ?? {};
    channelId = parseChannelIdFromUrl(findInObject(longBylineText, "url") ?? "");
    if(channelId === null) channelId = parseChannelIdFromUrl(findInObject(longBylineText, "canonicalBaseUrl") ?? "");
    if(channelId === null) channelId = findInObject(longBylineText, "browseId");
    if(channelName === null) channelName = findInObject(longBylineText, "text");

    // get channelId from "ownerText" node
    let ownerText = ((findInObject(data, "ownerText") ?? {}).runs ?? [])[0] ?? {};
    if(channelId === null) channelId = parseChannelIdFromUrl(findInObject(ownerText, "url") ?? "");
    if(channelId === null) channelId = parseChannelIdFromUrl(findInObject(ownerText, "canonicalBaseUrl") ?? "");
    if(channelId === null) channelId = findInObject(ownerText, "browseId");
    if(channelName === null) channelName = findInObject(ownerText, "text");

    // get channelId from "ownerText" node
    let shortBylineText = ((findInObject(data, "shortBylineText") ?? {}).runs ?? [])[0] ?? {};
    if(channelId === null) channelId = parseChannelIdFromUrl(findInObject(shortBylineText, "url") ?? "");
    if(channelId === null) channelId = parseChannelIdFromUrl(findInObject(shortBylineText, "canonicalBaseUrl") ?? "");
    if(channelId === null) channelId = findInObject(shortBylineText, "browseId");
    if(channelName === null) channelName = findInObject(shortBylineText, "text");

    // get channelId from "channelThumbnailData" node
    if(channelId === null) channelId = parseChannelIdFromUrl(findInObject(channelThumbnailData, "url") ?? "");
    if(channelId === null) channelId = parseChannelIdFromUrl(findInObject(channelThumbnailData, "canonicalBaseUrl") ?? "");
    if(channelId === null) channelId = findInObject(channelThumbnailData, "browseId");

    // get channelId from "avatar" node
    let avatarWebCommandMetadata = findInObject(avatar, "webCommandMetadata") ?? {};
    if(channelId === null) channelId = parseChannelIdFromUrl(findInObject(avatarWebCommandMetadata, "url") ?? "");
    if(channelId === null) channelId = findInObject(avatarWebCommandMetadata, "browseId");

    return {thumbnailUrl, channelId, channelName};
}

function parseListChannelItemData(data: { [key in string]: any }): ListChannelInfo {
    let channelId = data.channelId;
    let title = fallbackValue<string>(data, "title.simpleText") ?? "";
    let thumbnail = fallbackValue<{
        url: string,
        width: number,
        height: number
    }[]>(data, "thumbnail.thumbnails", [])?.at(-1)?.url ?? "";
    let description = fallbackValue<{ text: string }[]>(data, "descriptionSnippet.runs", [])?.at(0)?.text ?? "";

    return {
        type: "channel",
        id: channelId,
        title,
        thumbnail,
        description
    }
}
