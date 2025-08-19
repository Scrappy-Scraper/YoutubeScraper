import PromiseQueue, { BasePromiseQueueCallbackData, InputParam_OnTaskSuccess as Input_OnTaskSuccess, InputParam_OnTaskFail as Input_OnTaskFail } from "../PromiseQueue.js";
import { VideoInfo } from "../VideoParser.js";
export type VideoProcessingQueueInput = {
    videoId: string;
};
export type VideoProcessingQueueOutPut = VideoInfo;
export type CallbackData = {
    taskResponse: VideoProcessingQueueOutPut;
} & BasePromiseQueueCallbackData<VideoProcessingQueueInput, VideoProcessingQueueOutPut>;
export declare function make(params: {
    concurrency?: number;
    transcriptLanguageLimit?: number;
    preferredLanguages?: string[];
    onTaskStart?: (params: InputParams_OnTaskStart) => Promise<void>;
    onTaskSuccess?: (params: InputParams_OnTaskSuccess) => Promise<void>;
    onTaskFail?: (params: InputParams_OnTaskFail) => Promise<void>;
    getChannelProcessingQueue?: () => PromiseQueue<any, any>;
    proxyUrlGenerator?: (sessionId?: string | null | undefined) => Promise<string>;
    shouldLogTaskAlreadyAddedWarning?: boolean;
}): PromiseQueue<VideoProcessingQueueInput, VideoInfo>;
export type InputParams_OnTaskStart = BasePromiseQueueCallbackData<VideoProcessingQueueInput, VideoProcessingQueueOutPut>;
export declare function defaultOnTaskStart(params: InputParams_OnTaskStart): Promise<void>;
export type InputParams_OnTaskSuccess = Input_OnTaskSuccess<VideoProcessingQueueInput, VideoProcessingQueueOutPut>;
export declare function defaultOnTaskSuccess(params: InputParams_OnTaskSuccess): Promise<void>;
export type InputParams_OnTaskFail = Input_OnTaskFail<VideoProcessingQueueInput, VideoProcessingQueueOutPut>;
export declare function defaultOnTaskFail(params: InputParams_OnTaskFail): Promise<void>;
