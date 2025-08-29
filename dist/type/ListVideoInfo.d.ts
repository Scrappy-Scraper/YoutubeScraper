import { TimeUnit } from "../helpers/parseAgeText.js";
export type ListVideoInfo = {
    videoId: string;
    title: string;
    thumbnail: string;
    length?: number;
    viewCount?: number;
    age?: {
        amount: number;
        unit: TimeUnit;
    };
};
