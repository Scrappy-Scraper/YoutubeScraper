import PromiseQueue, {
    BasePromiseQueueCallbackData,
    InputParam_OnTaskSuccess as Input_OnTaskSuccess,
    InputParam_OnTaskFail as Input_OnTaskFail,
} from "../PromiseQueue.js";
import VideoParser, {Transcript} from "../VideoParser.js";

type VideoProcessingQueueInput = {videoId: string};     // Input data type for each of the processing task
type VideoProcessingQueueOutPut = { // Response data type
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    length: number;
    viewCount: number;
    channelId: string;
    author: string;
    isPrivate: boolean;
    transcripts: Transcript[]
};
export type CallbackData = {taskResponse: VideoProcessingQueueOutPut} & BasePromiseQueueCallbackData<VideoProcessingQueueInput, VideoProcessingQueueOutPut>;
export function make(params: {
    concurrency?: number; // number of tasks that can be in_progress at the same time. Before increasing this number, put in Proxy URL below
    transcriptLanguageLimit?: number; // -1 => all, 0 => none, 1+ => the max amount you want
    onTaskStart?: (params: InputParams_OnTaskStart) => void;
    onTaskSuccess?: (params: InputParams_OnTaskSuccess) => void;
    onTaskFail?: (params: InputParams_OnTaskFail) => void;
    getChannelProcessingQueue?: () => PromiseQueue<any, any>;
    proxyUrlGenerator?: () => Promise<string>;
    shouldLogTaskAlreadyAddedWarning?: boolean;
}) {
    const {
        concurrency = 3,
        transcriptLanguageLimit = 2,
        onTaskStart = defaultOnTaskStart,
        onTaskSuccess = defaultOnTaskSuccess,
        onTaskFail = defaultOnTaskFail,
        proxyUrlGenerator,
        shouldLogTaskAlreadyAddedWarning = false,
    } = params;
    const videoProcessingQueue = new PromiseQueue<VideoProcessingQueueInput, VideoProcessingQueueOutPut>();

    videoProcessingQueue.concurrency = concurrency;
    videoProcessingQueue.onTaskStart = onTaskStart;
    videoProcessingQueue.onTaskSuccess = onTaskSuccess;
    videoProcessingQueue.onTaskFail = onTaskFail;
    videoProcessingQueue.shouldLogTaskAlreadyAddedWarning = shouldLogTaskAlreadyAddedWarning;
    videoProcessingQueue.worker = async (value: VideoProcessingQueueInput): Promise<VideoProcessingQueueOutPut> => {
        const { videoId } = value;

        const videoParser = new VideoParser({ proxyUrlGenerator });
        await videoParser.load({videoId});

        const channelId = videoParser.channelId;    // read out the channel id of this video
        if(params.getChannelProcessingQueue) {
            await params.getChannelProcessingQueue().enqueue({  // parse info about this video's channel
                taskInputData: {channelId},
                taskId: channelId,
            });
        }

        await videoParser.fetchTranscripts({languageLimit: transcriptLanguageLimit});

        return videoParser.toJSON();
    }

    return videoProcessingQueue;
}

export type InputParams_OnTaskStart = BasePromiseQueueCallbackData<VideoProcessingQueueInput, VideoProcessingQueueOutPut>;
export function defaultOnTaskStart(params: InputParams_OnTaskStart) {
    const {taskId, taskInputData, promiseQueue} = params;
    console.log(`➡️🎬 Started parsing video ${taskId}`);
}

export type InputParams_OnTaskSuccess = Input_OnTaskSuccess<VideoProcessingQueueInput, VideoProcessingQueueOutPut>;
export function defaultOnTaskSuccess(params: InputParams_OnTaskSuccess) {
    const {taskResponse, taskId, taskInputData, promiseQueue} = params;
    console.log(`✅🎬 Completed parsing video ${taskId}`);
}

export type InputParams_OnTaskFail = Input_OnTaskFail<VideoProcessingQueueInput, VideoProcessingQueueOutPut>;
export function defaultOnTaskFail(params: InputParams_OnTaskFail) {
    const {error, taskId, taskInputData, promiseQueue} = params;
    console.error(`❌🎬 Failed parsing video ${taskId}`, error);
}
