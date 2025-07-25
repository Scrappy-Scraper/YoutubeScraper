# Youtube Scraper
Video -> Subtitle, title, description, views, thumbnail, duration, viewCount, channelId, etc

Channel -> Title, description, thumbnail, list of videos, etc

## Install
```shell
npm install @scrappy-scraper/youtube_scraper    # npm
yarn add @scrappy-scraper/youtube_scraper       # yarn
```

## Environment
Works in `Node.js` and `browsers`

## Local Build and Test
If you want to make modification and test it, look for the test file `index.test.ts`
The main code is in `src/index.ts`

### To Build
```shell
npm run build       # npm
yarn run build      # yarn
```
### To Test Run
```shell
npm run test       # npm
yarn run test      # yarn
```

## Sample Code
```typescript
import { VideoProcessingQueue, ChannelProcessingQueue, YouTubeUrl } from '@scrappy-scraper/youtube_scraper';

const proxyUrlGenerator = async (sessionId: string|null|undefined): Promise<string> => {
    return "http://username:password@host:port"
        .replace(":sessionId", sessionId || Math.round(Math.random() * 10**6).toString());
}

const videoProcessingQueue = VideoProcessingQueue.make({
    concurrency: 3,
    proxyUrlGenerator,
    getChannelProcessingQueue: () => { return channelProcessingQueue }, // include this line to automatically parse the info of the channel that this video belongs to
    // transcriptLanguageLimit: 3,
    // preferredLanguages: ["en", "es", "zh"],
    onTaskSuccess: async (data: VideoProcessingQueue.CallbackData) => {
        const {taskResponse, taskId, taskInputData, promiseQueue} = data;
        console.log(JSON.stringify(taskResponse, null, 4));
    }
});
const channelProcessingQueue = ChannelProcessingQueue.make({
    concurrency: 3,
    proxyUrlGenerator,
    onTaskSuccess: async (data: ChannelProcessingQueue.CallbackData) => {
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

## proxyUrlGenerator
Please put in **Rotating** Residential proxy url.

Session is supported by putting in `:sessionId` into the randomized segment of the url.

For example:

```markdown
// Provided by Proxy provider:
http://my_user_name_sid-adsfasdf:my_password@proxy.provider.io:port
http://my_user_name_sid-qwerqwer:my_password@proxy.provider.io:port
http://my_user_name_sid-zxcvzxcv:my_password@proxy.provider.io:port

// What you put in:
http://my_user_name_sid-:sessionId:my_password@proxy.provider.io:port
```
