import {parseYouTubeUrl} from "./src/YouTubeUrl";
import {writeToFile} from "./src/utils";
import * as VideoProcessingQueue from "./src/boilerplate/VideoProcessingQueue";
import * as ChannelProcessingQueue from "./src/boilerplate/ChannelProcessingQueue";


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


const videoProcessingQueue = VideoProcessingQueue.make({
    getChannelProcessingQueue: () => { return channelProcessingQueue },
    onTaskSuccess: (data: VideoProcessingQueue.CallbackData) => {
        const {taskResponse, taskId, taskInputData, promiseQueue} = data;
        writeToFile(`./output/video_${taskResponse.id}.json`, JSON.stringify(taskResponse, null, 4))
    }
});
const channelProcessingQueue = ChannelProcessingQueue.make({
    onTaskSuccess: (data: ChannelProcessingQueue.CallbackData) => {
        const {taskResponse, taskId, taskInputData, promiseQueue} = data;
        writeToFile(`./output/channel_${taskResponse.id}.json`, JSON.stringify(taskResponse, null, 4))
    }
});


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
    const parseResult = parseYouTubeUrl(url);
    if(parseResult === null) {
        console.error(`The provided URL is not supported: "${url}"`)
        continue;
    }

    let {type, id, cleanedUrl} = parseResult;
    if(type === "video") {
        videoProcessingQueue.enqueue({
            taskInputData: {videoId: id},
            taskId: id,
        });
    } else if(type === "channel") {
        channelProcessingQueue.enqueue({
            taskInputData: {channelId: id},
            taskId: id,
        })
    }
}

await videoProcessingQueue.allDone();
await channelProcessingQueue.allDone();

console.log("🎉 All Processing Done!\nCheck ./output folder for the results");
