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

## Sample Code

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
