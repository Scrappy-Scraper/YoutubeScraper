import PromiseQueue from "../PromiseQueue.js";
import VideoParser from "../VideoParser.js";
export function make(params) {
    const { concurrency = 3, transcriptLanguageLimit = 2, onTaskStart = defaultOnTaskStart, onTaskSuccess = defaultOnTaskSuccess, onTaskFail = defaultOnTaskFail, proxyUrlGenerator, } = params;
    const videoProcessingQueue = new PromiseQueue();
    videoProcessingQueue.concurrency = concurrency;
    videoProcessingQueue.onTaskStart = onTaskStart;
    videoProcessingQueue.onTaskSuccess = onTaskSuccess;
    videoProcessingQueue.onTaskFail = onTaskFail;
    videoProcessingQueue.worker = async (value) => {
        const { videoId } = value;
        const videoParser = new VideoParser({ proxyUrlGenerator });
        await videoParser.load({ videoId });
        const channelId = videoParser.channelId; // read out the channel id of this video
        if (params.getChannelProcessingQueue) {
            params.getChannelProcessingQueue().enqueue({
                taskInputData: { channelId },
                taskId: channelId,
            });
        }
        await videoParser.fetchTranscripts({ languageLimit: transcriptLanguageLimit });
        return videoParser.toJSON();
    };
    return videoProcessingQueue;
}
export function defaultOnTaskStart(params) {
    const { taskId, taskInputData, promiseQueue } = params;
    console.log(`➡️🎬 Started parsing video ${taskId}`);
}
export function defaultOnTaskSuccess(params) {
    const { taskResponse, taskId, taskInputData, promiseQueue } = params;
    console.log(`✅🎬 Completed parsing video ${taskId}`);
}
export function defaultOnTaskFail(params) {
    const { error, taskId, taskInputData, promiseQueue } = params;
    console.error(`❌🎬 Failed parsing video ${taskId}`, error);
}
