import {ListVideoInfo} from "./ListVideoInfo.js";

export type ChannelInfo = {
    id?: string;
    title?: string;
    description?: string;
    thumbnail?: string;
    banner?: string | null;
    rssUrl?: string;
    channelUrl?: string;
    vanityChannelUrl?: string;
    videos?: ListVideoInfo[];
    data_fetched_time: number,
};
