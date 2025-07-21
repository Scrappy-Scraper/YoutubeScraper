import {ChannelParser, VideoParser} from "./src";
import fs from "fs"

const writeToFile = (path: string, content: string) => {
    // create folder if not exists
    const folder = path.substring(0, path.lastIndexOf("/"));
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    fs.writeFileSync(path, content);
}

const videoParser = new VideoParser({
    // proxyUrlGenerator: async () => { return "https://Your-Proxy-URL-HERE" },
});
const channelParser = new ChannelParser({
    // proxyUrlGenerator: async () => { return "https://Your-Proxy-URL-HERE" },
});

await videoParser.load({videoId: "dQw4w9WgXcQ"});
const channelId = videoParser.channelId!;

await Promise.all([
    videoParser.fetchTranscripts({languageLimit: 3}),
    channelParser.load({channelId})
]);
while (channelParser.hasMoreVideos()) await channelParser.fetchMoreVideos();

writeToFile(`./output/video_${videoParser.videoId}.json`, JSON.stringify(videoParser.toJSON(), null, 4))
writeToFile(`./output/channel_${channelParser.channelId}.json`, JSON.stringify(channelParser.toJSON(), null, 4))
