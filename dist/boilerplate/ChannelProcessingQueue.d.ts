import PromiseQueue, { BasePromiseQueueCallbackData } from "../PromiseQueue.js";
type ChannelProcessingQueueInput = {
    channelId: string;
};
type ChannelProcessingQueueOutPut = {
    id?: string;
    title?: string;
    description?: string;
    thumbnail?: string;
    rssUrl?: string;
    channelUrl?: string;
    vanityChannelUrl?: string;
    videos: {
        videoId: string;
        thumbnail: string;
        title: string;
    }[];
};
export type CallbackData = {
    taskResponse: ChannelProcessingQueueOutPut;
} & BasePromiseQueueCallbackData<ChannelProcessingQueueInput, ChannelProcessingQueueOutPut>;
export declare function make(params: {
    concurrency?: number;
    onTaskStart?: (params: InputParams_OnTaskStart) => Promise<void>;
    onTaskSuccess?: (params: InputParams_OnTaskSuccess) => Promise<void>;
    onTaskFail?: (params: InputParams_OnTaskFail) => Promise<void>;
    proxyUrlGenerator?: (sessionId?: string | null | undefined) => Promise<string>;
    numVideos?: number;
    shouldLogTaskAlreadyAddedWarning?: boolean;
}): PromiseQueue<ChannelProcessingQueueInput, ChannelProcessingQueueOutPut>;
export type InputParams_OnTaskStart = BasePromiseQueueCallbackData<ChannelProcessingQueueInput, ChannelProcessingQueueOutPut>;
export declare function defaultOnTaskStart(params: InputParams_OnTaskStart): Promise<void>;
export type InputParams_OnTaskSuccess = {
    taskResponse: ChannelProcessingQueueOutPut;
} & BasePromiseQueueCallbackData<ChannelProcessingQueueInput, ChannelProcessingQueueOutPut>;
export declare function defaultOnTaskSuccess(params: InputParams_OnTaskSuccess): Promise<void>;
export type InputParams_OnTaskFail = {
    error: any;
} & BasePromiseQueueCallbackData<ChannelProcessingQueueInput, ChannelProcessingQueueOutPut>;
export declare function defaultOnTaskFail(params: InputParams_OnTaskFail): Promise<void>;
export {};
