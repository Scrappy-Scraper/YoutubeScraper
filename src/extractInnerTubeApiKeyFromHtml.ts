export default function extractInnerTubeApiKeyFromHtml(html: string): string {
    const pattern = /"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/;
    const match = html.match(pattern);

    if (!match || !match[1]) throw new Error('Could not extract API key from video page');

    return match[1];
}
