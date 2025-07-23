export declare function parseYouTubeUrl(youtubeURL: string): {
    type: "video" | "channel";
    id: string;
    cleanedUrl: string;
} | null;
export declare const videoUrlPatterns: RegExp[];
export declare function extractYoutubeVideoId(url: string): string | null;
export declare function isValidYouTubeVideoId(id: string): boolean;
export declare function isValidYouTubeVideoUrl(url: string): boolean;
export declare function cleanYouTubeVideoUrl(url: string): string;
export declare const channelUrlPatterns: RegExp[];
export declare const channelIdPatterns: RegExp[];
export declare function extractYoutubeChannelId(url: string): string | null;
export declare function isValidYouTubeChannelId(id: string): boolean;
export declare function reAdjustYouTubeChannelId(id: string): string;
export declare function isValidYouTubeChannelUrl(url: string): boolean;
export declare function cleanYouTubeChannelUrl(url: string): string;
