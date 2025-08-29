import { findInObject } from "../utils.js";
export function getNextPageAccessData(data, sortBy) {
    const sortByPositions = { newest: 0, popular: 1, oldest: 2 };
    let endpoint;
    if (sortBy && sortBy !== 'newest') {
        const feedFilter = findInObject(data, 'feedFilterChipBarRenderer');
        if (feedFilter && feedFilter.contents) {
            const chip = feedFilter.contents[sortByPositions[sortBy]];
            endpoint = chip?.chipCloudChipRenderer?.navigationEndpoint;
        }
    }
    else {
        endpoint = findInObject(data, 'continuationEndpoint');
    }
    if (!endpoint) {
        return null;
    }
    return {
        token: endpoint.continuationCommand.token,
        clickParams: { clickTrackingParams: endpoint.clickTrackingParams },
    };
}
