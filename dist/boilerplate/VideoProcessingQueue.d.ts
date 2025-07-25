import PromiseQueue, { BasePromiseQueueCallbackData, InputParam_OnTaskSuccess as Input_OnTaskSuccess, InputParam_OnTaskFail as Input_OnTaskFail } from "../PromiseQueue.js";
import { Transcript } from "../VideoParser.js";
type VideoProcessingQueueInput = {
    videoId: string;
};
type VideoProcessingQueueOutPut = {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    length: number;
    viewCount: number;
    channelId: string;
    author: string;
    isPrivate: boolean;
    transcripts: Transcript[];
};
export type CallbackData = {
    taskResponse: VideoProcessingQueueOutPut;
} & BasePromiseQueueCallbackData<VideoProcessingQueueInput, VideoProcessingQueueOutPut>;
export declare function make(params: {
    concurrency?: number;
    transcriptLanguageLimit?: number;
    preferredLanguages?: string[];
    onTaskStart?: (params: InputParams_OnTaskStart) => void;
    onTaskSuccess?: (params: InputParams_OnTaskSuccess) => void;
    onTaskFail?: (params: InputParams_OnTaskFail) => void;
    getChannelProcessingQueue?: () => PromiseQueue<any, any>;
    proxyUrlGenerator?: (sessionId?: string | null | undefined) => Promise<string>;
    shouldLogTaskAlreadyAddedWarning?: boolean;
}): PromiseQueue<VideoProcessingQueueInput, VideoProcessingQueueOutPut>;
export type InputParams_OnTaskStart = BasePromiseQueueCallbackData<VideoProcessingQueueInput, VideoProcessingQueueOutPut>;
export declare function defaultOnTaskStart(params: InputParams_OnTaskStart): void;
export type InputParams_OnTaskSuccess = Input_OnTaskSuccess<VideoProcessingQueueInput, VideoProcessingQueueOutPut>;
export declare function defaultOnTaskSuccess(params: InputParams_OnTaskSuccess): void;
export type InputParams_OnTaskFail = Input_OnTaskFail<VideoProcessingQueueInput, VideoProcessingQueueOutPut>;
export declare function defaultOnTaskFail(params: InputParams_OnTaskFail): void;
export {};
