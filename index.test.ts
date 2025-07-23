import {ChannelParser, VideoParser, PromiseQueue} from "./src";
import fs from "fs"
import {parseYouTubeUrl, reAdjustYouTubeChannelId} from "./src/YouTubeUrl";

const writeToFile = (path: string, content: string) => {
    // create folder if not exists
    const folder = path.substring(0, path.lastIndexOf("/"));
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    fs.writeFileSync(path, content);
}

/*
 * ============================================================
 *  Run this test code by running the below command in CLI:
 *  `npm run test`
 *  ----- OR -----
 *  `yarn run test`
 * ============================================================
 * The code below is an advanced sample code that queue up processing tasks in order to avoid processing large number of videos at the same time.
 * For simpler code example, refer to the one in README.md
 */


// ==================== instantiate Video Processing Queue ====================
type VideoProcessingQueueInput = {videoId: string};     // Input data type for each of the processing task
type VideoProcessingQueueOutPut = void;                 // Response data type
const videoProcessingQueue = new PromiseQueue<VideoProcessingQueueInput, VideoProcessingQueueOutPut>();

// ==================== instantiate Channel Processing Queue ====================
type ChannelProcessingQueueInput = {channelId: string};
type ChannelProcessingQueueOutPut = void;
const channelProcessingQueue = new PromiseQueue<ChannelProcessingQueueInput, ChannelProcessingQueueOutPut>();

// ==================== settings for Video Processing Queue ====================
videoProcessingQueue.concurrency = 3; // number of tasks that can be in_progress at the same time. Before increasing this number, put in Proxy URL below
videoProcessingQueue.onTaskStart = ({taskId}) => console.log(`➡️🎬 Started parsing video ${taskId}`);
videoProcessingQueue.onTaskSuccess = ({taskId}) => console.log(`✅🎬 Completed parsing video ${taskId}`);
videoProcessingQueue.onTaskFail = ({taskId}) => console.log(`❌🎬 Failed parsing video ${taskId}`);
videoProcessingQueue.worker = async (value: VideoProcessingQueueInput): Promise<VideoProcessingQueueOutPut> => {
    const { videoId } = value;

    const videoParser = new VideoParser({
        // proxyUrlGenerator: async () => { return "https://Your-Proxy-URL-HERE" },
    });
    await videoParser.load({videoId});

    const channelId = videoParser.channelId;    // read out the channel id of this video
    channelProcessingQueue.enqueue({            // parse info about this video's channel
        taskData: {channelId},
        taskId: channelId,
        logTaskAddedWarning: true,              // this is just to demo that the same channel won't be parsed twice.
    })

    await videoParser.fetchTranscripts({languageLimit: 2}); // fetch the transcripts of this video. languageLimit: -1 => all, 0 => none, 1+ => the max amount you want

    writeToFile(`./output/video_${videoParser.videoId}.json`, JSON.stringify(videoParser.toJSON(), null, 4))
}

// ==================== settings for Channel Processing Queue ====================
channelProcessingQueue.concurrency = 2;       // number of tasks that can be in_progress at the same time
channelProcessingQueue.onTaskStart = ({taskId}) => console.log(`➡️📺 Started parsing channel ${taskId}`);
channelProcessingQueue.onTaskSuccess = ({taskId}) => console.log(`✅📺 Completed parsing channel ${taskId}`);
channelProcessingQueue.onTaskFail = ({taskId}) => console.log(`❌📺 Failed parsing channel ${taskId}`);
channelProcessingQueue.reAdjustTaskId = reAdjustYouTubeChannelId;
channelProcessingQueue.worker = async (value: ChannelProcessingQueueInput): Promise<ChannelProcessingQueueOutPut> => {
    const channelParser = new ChannelParser({
        // proxyUrlGenerator: async () => { return "https://Your-Proxy-URL-HERE" },
    });

    let { channelId } = value;

    await channelParser.load({channelId});
    while (channelParser.hasMoreVideos() && channelParser.videos.length < 100) { // while there are more videos to fetch. Also, limit the fetch to 100 videos
        await channelParser.fetchMoreVideos();
    }
    writeToFile(`./output/channel_${channelParser.channelId}.json`, JSON.stringify(channelParser.toJSON(), null, 4));
}


// ==================== Start the Parsing Process ====================
const urls = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=Y39LE5ZoKjw",
    "https://www.youtube.com/watch?v=Y39LE5ZoKjwa", // a broken video url; it's here for testing purpose
    "https://www.youtube.com/watch?v=BeyEGebJ1l4",
    "https://www.youtube.com/watch?v=C2xel6q0yao",
    "https://www.youtube.com/watch?v=u_Lxkt50xOg",
    "https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw",
    "https://www.youtube.com/@PewDiePie",
    "https://www.youtube.com/@MrBeast",
];



for(let url of urls) {
    let {type, id, cleanedUrl} = parseYouTubeUrl(url);
    if(type === "video") {
        videoProcessingQueue.enqueue({
            taskData: {videoId: id},
            taskId: id,
            logTaskAddedWarning: true, // this is just to demo that the same video won't be parsed twice. Feel free to remove or comment-out this line
        });
    } else if(type === "channel") {
        channelProcessingQueue.enqueue({
            taskData: {channelId: id},
            taskId: id,
            logTaskAddedWarning: true, // this is just to demo that the same channel won't be parsed twice. Feel free to remove or comment-out this line
        })
    }
}

await videoProcessingQueue.allDone();
await channelProcessingQueue.allDone();

console.log("🎉 All Processing Done!\nCheck ./output folder for the results");


