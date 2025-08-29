import PromiseQueue from "../PromiseQueue.js";
import { reAdjustYouTubeChannelId } from "../YouTubeUrl.js";
import ChannelParser from "../ChannelParser.js";
export function make(params) {
    const { concurrency = 2, onTaskStart = defaultOnTaskStart, onTaskSuccess = defaultOnTaskSuccess, onTaskFail = defaultOnTaskFail, proxyUrlGenerator, numVideos = 100, shouldLogTaskAlreadyAddedWarning = false, } = params;
    const channelProcessingQueue = new PromiseQueue();
    channelProcessingQueue.concurrency = concurrency; // number of tasks that can be in_progress at the same time
    channelProcessingQueue.onTaskStart = onTaskStart;
    channelProcessingQueue.onTaskSuccess = onTaskSuccess;
    channelProcessingQueue.onTaskFail = onTaskFail;
    channelProcessingQueue.shouldLogTaskAlreadyAddedWarning = shouldLogTaskAlreadyAddedWarning;
    channelProcessingQueue.reAdjustTaskId = reAdjustYouTubeChannelId;
    channelProcessingQueue.worker = async (value) => {
        let { channelId } = value;
        const channelParser = new ChannelParser({ proxyUrlGenerator });
        await channelParser.load({ channelId });
        while (channelParser.hasMoreVideos() && channelParser.videos.length < numVideos)
            await channelParser.fetchMoreVideos();
        const data = channelParser.toJSON();
        data.videos;
        let extractedChannelId = data.id;
        if (extractedChannelId) {
            extractedChannelId = reAdjustYouTubeChannelId(extractedChannelId);
            await channelProcessingQueue.taskManager.addTaskToSucceeded(extractedChannelId);
        }
        return data;
    };
    return channelProcessingQueue;
}
export async function defaultOnTaskStart(params) {
    const { taskId, taskInputData, promiseQueue } = params;
    console.log(`➡️📺 Started parsing channel ${taskId}`);
}
export async function defaultOnTaskSuccess(params) {
    const { taskResponse, taskId, taskInputData, promiseQueue } = params;
    console.log(`✅📺 Completed parsing channel ${taskId}`);
}
export async function defaultOnTaskFail(params) {
    const { error, taskId, taskInputData, promiseQueue } = params;
    console.log(`❌📺 Failed parsing channel ${taskId}`);
}
