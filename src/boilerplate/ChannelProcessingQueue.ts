import PromiseQueue, {BasePromiseQueueCallbackData} from "../PromiseQueue.js";
import {reAdjustYouTubeChannelId} from "../YouTubeUrl.js";
import ChannelParser from "../ChannelParser.js";

export type ChannelProcessingQueueInput = {channelId: string};
export type ChannelProcessingQueueOutPut = {
    id?: string;
    title?: string;
    description?: string;
    thumbnail?: string;
    rssUrl?: string;
    channelUrl?: string;
    vanityChannelUrl?: string;
    videos: {videoId: string, thumbnail: string, title: string}[];
};
export type CallbackData = {taskResponse: ChannelProcessingQueueOutPut} & BasePromiseQueueCallbackData<ChannelProcessingQueueInput, ChannelProcessingQueueOutPut>;
export function make(params: {
    concurrency?: number; // number of tasks that can be in_progress at the same time. Before increasing this number, put in Proxy URL below
    onTaskStart?: (params: InputParams_OnTaskStart) => Promise<void>;
    onTaskSuccess?: (params: InputParams_OnTaskSuccess) => Promise<void>;
    onTaskFail?: (params: InputParams_OnTaskFail) => Promise<void>;
    proxyUrlGenerator?: (sessionId?: string|null|undefined) => Promise<string>;
    numVideos?: number;
    shouldLogTaskAlreadyAddedWarning?: boolean;
}) {
    const {
        concurrency = 2,
        onTaskStart = defaultOnTaskStart,
        onTaskSuccess = defaultOnTaskSuccess,
        onTaskFail = defaultOnTaskFail,
        proxyUrlGenerator,
        numVideos = 100,
        shouldLogTaskAlreadyAddedWarning = false,
    } = params;
    const channelProcessingQueue = new PromiseQueue<ChannelProcessingQueueInput, ChannelProcessingQueueOutPut>();

    channelProcessingQueue.concurrency = concurrency; // number of tasks that can be in_progress at the same time
    channelProcessingQueue.onTaskStart = onTaskStart;
    channelProcessingQueue.onTaskSuccess = onTaskSuccess;
    channelProcessingQueue.onTaskFail = onTaskFail;
    channelProcessingQueue.shouldLogTaskAlreadyAddedWarning = shouldLogTaskAlreadyAddedWarning;
    channelProcessingQueue.reAdjustTaskId = reAdjustYouTubeChannelId;
    channelProcessingQueue.worker = async (value: ChannelProcessingQueueInput): Promise<ChannelProcessingQueueOutPut> => {
        let { channelId } = value;

        const channelParser = new ChannelParser({ proxyUrlGenerator });
        await channelParser.load({channelId});

        while (channelParser.hasMoreVideos() && channelParser.videos.length < numVideos) await channelParser.fetchMoreVideos();

        const data = channelParser.toJSON();
        let extractedChannelId = data.id;
        if(extractedChannelId) {
            extractedChannelId = reAdjustYouTubeChannelId(extractedChannelId);
            await channelProcessingQueue.taskManager.addTaskToSucceeded(extractedChannelId);
        }

        return data;
    }

    return channelProcessingQueue;
}

export type InputParams_OnTaskStart = BasePromiseQueueCallbackData<ChannelProcessingQueueInput, ChannelProcessingQueueOutPut>;
export async function defaultOnTaskStart(params: InputParams_OnTaskStart) {
    const {taskId, taskInputData, promiseQueue} = params;
    console.log(`➡️📺 Started parsing channel ${taskId}`);
}

export type InputParams_OnTaskSuccess = { taskResponse: ChannelProcessingQueueOutPut } & BasePromiseQueueCallbackData<ChannelProcessingQueueInput, ChannelProcessingQueueOutPut>;
export async function defaultOnTaskSuccess(params: InputParams_OnTaskSuccess) {
    const {taskResponse, taskId, taskInputData, promiseQueue} = params;
    console.log(`✅📺 Completed parsing channel ${taskId}`)
}

export type InputParams_OnTaskFail = { error: any } & BasePromiseQueueCallbackData<ChannelProcessingQueueInput, ChannelProcessingQueueOutPut>;
export async function defaultOnTaskFail(params: InputParams_OnTaskFail) {
    const {error, taskId, taskInputData, promiseQueue} = params;
    console.log(`❌📺 Failed parsing channel ${taskId}`);
}
