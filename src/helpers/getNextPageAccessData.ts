import {findInObject} from "../utils.js";

export function getNextPageAccessData(data: any, sortBy?: string): {
    token: string;
    clickParams: {
        clickTrackingParams: string;
    };
} | null {
    const sortByPositions: Record<string, number> = {newest: 0, popular: 1, oldest: 2};
    let endpoint: any;

    if (sortBy && sortBy !== 'newest') {
        const feedFilter = findInObject(data, 'feedFilterChipBarRenderer');
        if (feedFilter && feedFilter.contents) {
            const chip = feedFilter.contents[sortByPositions[sortBy]];
            endpoint = chip?.chipCloudChipRenderer?.navigationEndpoint;
        }
    } else {
        endpoint = findInObject(data, 'continuationEndpoint');
    }

    if (!endpoint) {
        return null;
    }

    return {
        token: endpoint.continuationCommand.token,
        clickParams: {clickTrackingParams: endpoint.clickTrackingParams},
    };
}
