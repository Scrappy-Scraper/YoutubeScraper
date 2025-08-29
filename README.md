# Youtube Scraper

| feature            |                Video                 |    Channel     |
|--------------------|:------------------------------------:|:--------------:|
| title              |                  ✅                   |       ✅        |
| description        |                  ✅                   |       ✅        |
| thumbnail          |                  ✅                   |       ✅        |
| transcripts        |                  ✅                   |     N / A      |
| video download url |                  ✅                   |     N / A      |
| other fields       | views, duration, viewCount, and more | list of videos |

Also supports YouTube search


Try out this scraper for free on [Apify.com](https://apify.com/scrappy-scraper/youtubescraper-apify)

## Install
```shell
npm install @scrappy-scraper/youtube_scraper    # npm
yarn add @scrappy-scraper/youtube_scraper       # yarn
```

## Environment
Works in `Node.js` and `react-native`

Works in Chrome extension when running on `youtube.com` page.

Does not work in `browser` due to limited CORS setting from YouTube

## Sample Code
```typescript
/* Get VideoInfo and Download Captions */

import { VideoParser } from '@scrappy-scraper/youtube_scraper';
const videoParser = new VideoParser();
await videoParser.load({videoId: "dQw4w9WgXcQ"}); // Rick Roll

// show the available caption tracks
console.log(videoParser.availableCaptions);     // example: [ { name: 'English', languageCode: 'en', isGenerated: false } ]

// fetch transcripts
await videoParser.fetchTranscripts({languageLimit: 3, preferredLanguages: ['en']})

// show all the data
console.log(JSON.stringify(videoParser.toJSON())) // captions are inside this JSON, along with other data
```

```typescript
/* Get ChannelInfo and list of videos */

import { ChannelParser } from '@scrappy-scraper/youtube_scraper';
const channelParser = new ChannelParser();
await channelParser.load({ channelId: "@RickAstleyYT" })

if(channelParser.hasMoreVideos()) await channelParser.fetchMoreVideos(); // can use "while" instead of "if"

console.log(channelParser.toJSON())
```

```typescript
/* Perform YouTube Search */

import { SearchHandler } from '@scrappy-scraper/youtube_scraper';
let searchHandler = new SearchHandler();
await searchHandler.search({ query: "Rick Astley" });

if(searchHandler.hasMoreItems()) await searchHandler.fetchMoreItems(); // can use "while" instead of "if"
console.log(searchHandler.toJSON())
```


## proxyUrlGenerator
Please put in **Rotating** Residential proxy url.

Session is supported by putting in `:sessionId` into the randomized segment of the url.

For example:

```typescript
// Provided by Proxy provider:
"http://my_user_name_sid-adsfasdf:my_password@proxy.provider.io:port"
"http://my_user_name_sid-qwerqwer:my_password@proxy.provider.io:port"
"http://my_user_name_sid-zxcvzxcv:my_password@proxy.provider.io:port"

// What you put in:
"http://my_user_name_sid-:sessionId:my_password@proxy.provider.io:port"

// create proxyUrlGenerator 
const proxyUrlGenerator = async (sessionId: string|null|undefined): Promise<string> => {
    return "http://username:password@host:port"
        .replace(":sessionId", sessionId || Math.round(Math.random() * 10**6).toString());
}

// instantiate parsers with the proxyUrlGenerator
let videoParser = new VideoParser({ proxyUrlGenerator });
let channelParser = new ChannelParser({ proxyUrlGenerator });
let searchHandler = new SearchHandler({ proxyUrlGenerator });
```

## Local Build and Test
If you want to make modification and test it, look for the test file `index.test.ts`
The main code is in `src/index.ts`

### Clone the Repository
```shell
git clone https://github.com/Scrappy-Scraper/YoutubeScraper.git
cd YoutubeScraper
npm install
```

### To Test Run
```shell
npm run test       # npm
yarn run test      # yarn
```

### To Build JS File
```shell
npm run build       # npm
yarn run build      # yarn
```
