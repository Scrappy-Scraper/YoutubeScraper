import { ListVideoInfo } from "../type/ListVideoInfo.js";
import { ListChannelInfo } from "../type/ListChannelInfo.js";
export default function parseListItemData(data: {
    [key in string]: any;
}): ListVideoInfo | ListChannelInfo | null;
