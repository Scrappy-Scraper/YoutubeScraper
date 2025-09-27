import { TimeUnit } from "../helpers/parseAgeText.js";
export type ListVideoInfo = {
    type: "video";
    id: string;
    title: string;
    thumbnail: string;
    length?: number;
    viewCount?: number;
    age?: {
        amount: number;
        unit: TimeUnit;
    };
    channelThumbnail?: string | null;
    channelId?: string | null;
};
