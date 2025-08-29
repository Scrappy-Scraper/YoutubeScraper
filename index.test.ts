import {ChannelProcessingQueue, VideoProcessingQueue, YouTubeUrl, SearchHandler} from "./src";
import fs from "fs";

export const writeToFile = (path: string, content: string) => {
    // create folder if not exists
    const folder = path.substring(0, path.lastIndexOf("/"));
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, {recursive: true});

    fs.writeFileSync(path, content);
}

export async function downloadAsFile(url: string, filename: string) {
    // NOTE: this only works on node.js
    let fs = await import("fs");

    let res = await fetch(url, { method: 'GET' });
    while(res.redirected) res = await fetch(res.url, { method: 'GET' });

    const reader = res.body!.getReader();
    let data: ReadableStreamReadResult<Uint8Array<ArrayBufferLike>> = await reader.read();

    // @ts-ignore
    const fileStream = fs.createWriteStream(filename);
    while (!data.done) {
        fileStream.write(Buffer.from(data.value));
        data = await reader.read();
    }
    fileStream.end();
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

/*
const proxyUrlGenerator = async (sessionId: string|null|undefined): Promise<string> => {
    return "http://username:password@host:port"
        .replace(":sessionId", sessionId || Math.round(Math.random() * 10**6).toString());
}
*/

const videoProcessingQueue = VideoProcessingQueue.make({
    concurrency: 3,
    getChannelProcessingQueue: () => { return channelProcessingQueue }, // include this line to automatically parse the info of the channel
    // proxyUrlGenerator, // TODO: Optional: Un-comment this line when you have filled-in the proxy url above
    shouldLogTaskAlreadyAddedWarning: true,
    // transcriptLanguageLimit: 3,
    // preferredLanguages: ["en", "es", "zh"],
    onTaskSuccess: async (data: VideoProcessingQueue.CallbackData) => {
        const {taskResponse, taskId, taskInputData, promiseQueue} = data;
        // await downloadAsFile(taskResponse.mediaFiles[0].url, `./output/videoFile_${taskResponse.id}.mp4`) // uncomment this line to test the file download
        writeToFile(`./output/video_${taskResponse.id}.json`, JSON.stringify(taskResponse, null, 4));
        await VideoProcessingQueue.defaultOnTaskSuccess(data);
    }
});
const channelProcessingQueue = ChannelProcessingQueue.make({
    concurrency: 3,
    // proxyUrlGenerator, // TODO: Un-comment this line when you have filled-in the proxy url above
    shouldLogTaskAlreadyAddedWarning: true,
    onTaskSuccess: async (data: ChannelProcessingQueue.CallbackData) => {
        const {taskResponse, taskId, taskInputData, promiseQueue} = data;
        writeToFile(`./output/channel_${taskResponse.id}.json`, JSON.stringify(taskResponse, null, 4));
        await ChannelProcessingQueue.defaultOnTaskSuccess(data);
    }
});


// ==================== Start the Parsing Process ====================
const urls = [
    // videos
    "https://www.youtube.com/watch?v=pzBi1nwDn8U",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=Y39LE5ZoKjw",
    // "https://www.youtube.com/watch?v=Y39LE5ZoKjwa", // a broken video url; un-comment it to test failure handling
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


let searchHandler: SearchHandler = new SearchHandler();
await searchHandler.search({
    query: "Rick Astley",
});
let pageNumber = 1;
while (searchHandler.hasMoreItems() && pageNumber < 2) {
    await searchHandler.fetchMoreItems();
    pageNumber += 1;
}
let searchResult = searchHandler.toJSON();
searchResult = {query: searchHandler.query, ...searchResult}
writeToFile(`./output/searchResult.json`, JSON.stringify(searchResult, null, 4));



console.log("\n🎉 All Processing Done!\nCheck ./output folder for the results");
