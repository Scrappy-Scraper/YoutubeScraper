import {Transcript} from "./Transcript.js";

export type VideoInfo = {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    mediaFiles: ({
        "url": string;
        "mimeType": string;
        "bitrate": number;
        "width"?: number;
        "height"?: number;
        "fps"?: number;
    } & { [key in string]: any })[];
    uploadedTime: number | null;
    length: number;
    isLive: boolean;
    isLiveContent: boolean;
    viewCount: number;
    channelId: string;
    author: string;
    isPrivate: boolean;
    transcripts: Transcript[];
    availableTranscripts: { name: string, languageCode: string, isGenerated: boolean }[];
    data_fetched_time: number;
}
