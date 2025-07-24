# Youtube Scraper
Video -> Subtitle, title, description, views, thumbnail, duration, viewCount, channelId, etc

Channel -> Title, description, thumbnail, list of videos, etc

## Install
```aiignore
npm install @scrappy-scraper/youtube_scraper    # npm
yarn add @scrappy-scraper/youtube_scraper       # yarn
```

## Environment
Works in `Node.js` and `browsers`

## Local Build and Test
If you want to make modification and test it, look for the test file `index.test.ts`
The main code is in `src/index.ts`

### To Build
```aiignore
npm run build       # npm
yarn run build      # yarn
```
### To Test Run
```aiignore
npm run test       # npm
yarn run test      # yarn
```

## Sample Code
### Simple Sample
```aiignore
import { ChannelParser, VideoParser } from '@scrappy-scraper/youtube_scraper';

// instantiate parsers
const videoParser = new VideoParser({
    // proxyUrlGenerator: async () => { return "https://Your-Proxy-URL-HERE" },
});
const channelParser = new ChannelParser({
    // proxyUrlGenerator: async () => { return "https://Your-Proxy-URL-HERE" },
});

// parse video
await videoParser.load({videoId: "dQw4w9WgXcQ"});
console.log(videoParser.availableCaptions);     // example: [ { name: 'English', languageCode: 'en', isGenerated: false } ]
const channelId = videoParser.channelId!; // get the channelId after the load method is done

await Promise.all([
    videoParser.fetchTranscripts({languageLimit: 3}),   // load transcripts, limit to 3 languages. Default is 3. Put -1 to get ALL; put 0 to get none
    channelParser.load({channelId}),                    // load info about the channel and a few videos
]);
while (channelParser.hasMoreVideos() && channelParser.videos.length < 100) await channelParser.fetchMoreVideos();

console.log(JSON.stringify(videoParser.toJSON()))
console.log(JSON.stringify(channelParser.toJSON()))

```

### Queued Sample
This is the recommended way to run the parsers.
Queuing helps avoid huge number of concurrent requests; this prevents over-burdening the network or getting the IP address banned.
```aiignore
import { VideoProcessingQueue, ChannelProcessingQueue, YouTubeUrl } from '@scrappy-scraper/youtube_scraper';

const proxyUrlGenerator = () => { return "https://Your-Proxy-URL-HERE"; }

const videoProcessingQueue = VideoProcessingQueue.make({
    concurrency: 3,
    proxyUrlGenerator,
    getChannelProcessingQueue: () => { return channelProcessingQueue }, // include this line to automatically parse the info of the channel that this video belongs to
    onTaskSuccess: (data: VideoProcessingQueue.CallbackData) => {
        const {taskResponse, taskId, taskInputData, promiseQueue} = data;
        console.log(JSON.stringify(taskResponse, null, 4));
    }
});
const channelProcessingQueue = ChannelProcessingQueue.make({
    concurrency: 3,
    proxyUrlGenerator,
    onTaskSuccess: (data: ChannelProcessingQueue.CallbackData) => {
        const {taskResponse, taskId, taskInputData, promiseQueue} = data;
        console.log(JSON.stringify(taskResponse, null, 4));
    }
});

const urls = [
    // videos
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=Y39LE5ZoKjw",
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

```
