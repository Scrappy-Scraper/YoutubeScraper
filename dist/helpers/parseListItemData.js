import { fallbackValue } from "../utils.js";
import { parseAgeText } from "./parseAgeText.js";
export default function parseListItemData(data) {
    if (data.hasOwnProperty("videoId"))
        return parseListVideoItemData(data);
    if (data.hasOwnProperty("channelId"))
        return parseListChannelItemData(data);
    return null;
}
function parseListVideoItemData(data) {
    const { videoId } = data;
    const title = data.title.runs[0].text;
    const thumbnail = data.thumbnail.thumbnails[0].url;
    // view count
    let viewCount = parseInt((data.viewCountText?.simpleText ?? "").toLowerCase().replaceAll(",", "").replaceAll(".", "").replaceAll("views").trim());
    if (isNaN(viewCount))
        viewCount = undefined;
    // length (in seconds)
    let lengthText = data.lengthText?.simpleText ?? null;
    let length = undefined;
    if (lengthText) {
        let lengthParts = lengthText.split(":");
        if (lengthParts.length === 2) {
            length = parseInt(lengthParts[0]) * 60 + parseInt(lengthParts[1]);
        }
        else if (lengthParts.length === 3) {
            length = parseInt(lengthParts[0]) * 3600 + parseInt(lengthParts[1]) * 60 + parseInt(lengthParts[2]);
        }
        else if (lengthParts.length === 4) {
            length = parseInt(lengthParts[0]) * 86400 + parseInt(lengthParts[1]) * 3600 + parseInt(lengthParts[2]) * 60 + parseInt(lengthParts[3]);
        }
        else {
            length = undefined;
        }
    }
    // age
    let age = undefined;
    let ageText = data.publishedTimeText?.simpleText ?? null;
    if (ageText) {
        age = parseAgeText(ageText);
    }
    return { videoId, title, thumbnail, viewCount, length, age };
}
function parseListChannelItemData(data) {
    let channelId = data.channelId;
    let title = fallbackValue(data, "title.simpleText") ?? "";
    let thumbnail = fallbackValue(data, "thumbnail.thumbnails", [])?.at(-1)?.url ?? "";
    let description = fallbackValue(data, "descriptionSnippet.runs", [])?.at(0)?.text ?? "";
    return {
        channelId,
        title,
        thumbnail,
        description
    };
}
