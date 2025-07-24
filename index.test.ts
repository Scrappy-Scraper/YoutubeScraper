import {VideoProcessingQueue, ChannelProcessingQueue, YouTubeUrl, Utils} from "./src";

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

// const proxyUrlGenerator = () => { return "https://Your-Proxy-URL-HERE"; }

const videoProcessingQueue = VideoProcessingQueue.make({
    concurrency: 3,
    getChannelProcessingQueue: () => { return channelProcessingQueue }, // include this line to automatically parse the info of the channel
    // proxyUrlGenerator,
    shouldLogTaskAlreadyAddedWarning: true,
    onTaskSuccess: (data: VideoProcessingQueue.CallbackData) => {
        const {taskResponse, taskId, taskInputData, promiseQueue} = data;
        Utils.writeToFile(`./output/video_${taskResponse.id}.json`, JSON.stringify(taskResponse, null, 4));
        VideoProcessingQueue.defaultOnTaskSuccess(data);
    }
});
const channelProcessingQueue = ChannelProcessingQueue.make({
    concurrency: 3,
    // proxyUrlGenerator,
    shouldLogTaskAlreadyAddedWarning: true,
    onTaskSuccess: (data: ChannelProcessingQueue.CallbackData) => {
        const {taskResponse, taskId, taskInputData, promiseQueue} = data;
        Utils.writeToFile(`./output/channel_${taskResponse.id}.json`, JSON.stringify(taskResponse, null, 4));
        ChannelProcessingQueue.defaultOnTaskSuccess(data);
    }
});


// ==================== Start the Parsing Process ====================
const urls = [
    // videos
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=Y39LE5ZoKjw",
    "https://www.youtube.com/watch?v=Y39LE5ZoKjwa", // a broken video url; it's here for testing purpose
    "https://www.youtube.com/watch?v=BeyEGebJ1l4",
    "https://www.youtube.com/watch?v=C2xel6q0yao",
    "https://www.youtube.com/watch?v=u_Lxkt50xOg",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // duplicate
    "https://www.youtube.com/watch?v=C2xel6q0yao", // duplicate

    // channels
    "https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw",
    "https://www.youtube.com/@PewDiePie",
    "https://www.youtube.com/@MrBeast",
];



for(let url of urls) {
    const parseResult = YouTubeUrl.parseYouTubeUrl(url);
    if(parseResult === null) {
        console.error(`The provided URL is not supported: "${url}"`)
        continue;
    }

    let {type, id, cleanedUrl} = parseResult;
    if(type === "video") {
        await videoProcessingQueue.enqueue({
            taskInputData: {videoId: id},
            taskId: id,
        });
    } else if(type === "channel") {
        await channelProcessingQueue.enqueue({
            taskInputData: {channelId: id},
            taskId: id,
        })
    }
}

await videoProcessingQueue.allDone();
await channelProcessingQueue.allDone();

console.log("🎉 All Processing Done!\nCheck ./output folder for the results");
