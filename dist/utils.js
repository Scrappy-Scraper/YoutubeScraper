import axios from "axios";
export const sleepAsync = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function raceRequests(params) {
    const { generateRequest, amount, waitTime } = params;
    let shouldRetry = params.shouldRetry ?? ((e) => true);
    if (amount === 0)
        throw new Error('Amount of requests must be greater than 0');
    const tasks = [];
    let isDone = false;
    let retry = true;
    for (let ind = 0; ind < amount; ind++) {
        if (isDone)
            break; // if one of the existing is done successfully, stop adding new tasks
        const task = generateRequest();
        tasks.push(task);
        task
            .then(() => { isDone = true; })
            .catch((e) => { retry = shouldRetry(e); });
        if (waitTime) {
            let waitStart = new Date().getTime();
            while (new Date().getTime() - waitStart < waitTime * 1000) {
                if (isDone)
                    return Promise.any(tasks);
                if (await allPromisesFailed(tasks))
                    break;
                await sleepAsync(10);
            }
        }
        if (!retry)
            break;
        new Promise(resolve => setTimeout(resolve, waitTime));
    }
    return Promise.any(tasks);
}
async function getPromiseStatus(promise) {
    return new Promise((resolve) => {
        Promise.race([
            promise.catch(() => { resolve("failed"); }),
            promise.then(() => { resolve("success"); }),
            new Promise(res => setTimeout(() => { resolve("in_progress"); }, 1))
        ]).then((val) => { resolve(val); });
    });
}
async function allPromisesFailed(promises) {
    let statuses = await Promise.all(promises.map((promise) => getPromiseStatus(promise)));
    return statuses.filter((status) => status !== "failed").length === 0;
}
export async function makeHttpRequest(params) {
    const { url, proxyUrl, method = 'GET', requestData, headers = {}, timeout = 30000 } = params;
    try {
        // Prepare axios config
        const axiosConfig = {
            url,
            method,
            timeout,
            headers: {
                'Accept-Language': 'en-US',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                ...headers,
            },
            // Disable automatic response validation to handle non-2xx status codes manually
            validateStatus: () => true,
        };
        // Add request data for POST/PUT methods
        if (requestData) {
            axiosConfig.data = requestData;
            axiosConfig.headers['Content-Type'] = axiosConfig.headers['Content-Type'] || 'application/json';
        }
        // Handle proxy configuration
        if (proxyUrl) {
            const { HttpsProxyAgent } = await import('https-proxy-agent');
            axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
        }
        // Make the request
        const response = await axios(axiosConfig);
        // Handle HTTP error status codes
        if (response.status >= 400) {
            throw new Error(`HTTP ${response.status}: ${response.data}`);
        }
        return {
            text: (typeof response.data === 'string') ? response.data : JSON.stringify(response.data),
            status: response.status,
            proxyUrl,
        };
    }
    catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                throw new Error('Request timeout');
            }
            if (error.response) {
                throw new Error(`HTTP ${error.response.status}`);
            }
            throw new Error(error.message);
        }
        throw error;
    }
}
export function unescapeHtml(text) {
    const entities = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&#39;': "'",
        '&#x27;': "'",
        '&#x2F;': '/',
        '&#x60;': '`',
        '&#x3D;': '=',
    };
    return text.replace(/&[a-zA-Z0-9#]+;/g, (match) => {
        return entities[match] || match;
    });
}
// Extract JSON data from HTML. Keep in mind this is prone to failure so please be ready to handle it with fallback
export function getJsonFromHtml(html, key, numChars = 2, stop = '"') {
    const startPos = html.indexOf(key) + key.length + numChars;
    const endPos = html.indexOf(stop, startPos);
    return html.substring(startPos, endPos);
}
// Find a specific key in nested object
export function findInObject(obj, searchKey) {
    const queue = [obj];
    while (queue.length > 0) {
        const current = queue.shift();
        if (current && typeof current === 'object') {
            if (Array.isArray(current)) {
                queue.push(...current);
            }
            else {
                for (const [key, value] of Object.entries(current)) {
                    if (key === searchKey) {
                        return value;
                    }
                    queue.push(value);
                }
            }
        }
    }
    return null;
}
export function getAllDescendantObjects(params) {
    const { rootNode, isMatch, parentKey = null } = params;
    if (Array.isArray(rootNode)) {
        return rootNode.flatMap((node) => getAllDescendantObjects({ rootNode: node, isMatch, parentKey }));
    }
    if (typeof rootNode !== 'object' || rootNode === null)
        return [];
    const descendantNodes = [];
    for (const [key, value] of Object.entries(rootNode)) {
        // go over this root node's children
        const matched = isMatch({
            node: value,
            parentKey: key,
        });
        if (matched)
            descendantNodes.push(value);
        descendantNodes.push(...getAllDescendantObjects({ rootNode: value, isMatch, parentKey: key }));
    }
    return descendantNodes;
}
export function isTrue(val) {
    if (typeof val === "string") {
        const lower = val.toLowerCase();
        return (lower === "true" || lower === "yes" || lower === "1" || lower === "t");
    }
    else if (typeof val === "boolean") {
        return val;
    }
    else if (typeof val === "number") {
        return val === 1;
    }
    return false;
}
export function fallbackValue(val, path = null, defaultVal = null) {
    let route = [];
    if (path !== null) {
        let paths = path.split(".");
        paths.forEach((currentPath) => {
            let leftSquareBracketInd = currentPath.indexOf("[");
            let rightSquareBracketInd = currentPath.indexOf("]");
            if (leftSquareBracketInd === -1) {
                route.push(currentPath);
            }
            else {
                let fieldName = currentPath.slice(0, leftSquareBracketInd);
                if (fieldName !== "") {
                    route.push(fieldName);
                }
                while (leftSquareBracketInd !== -1) {
                    let numString = currentPath.slice(leftSquareBracketInd + 1, rightSquareBracketInd);
                    route.push(parseInt(numString).toString());
                    currentPath = currentPath.slice(rightSquareBracketInd + 1);
                    leftSquareBracketInd = currentPath.indexOf("[");
                    rightSquareBracketInd = currentPath.indexOf("]");
                }
            }
        });
    }
    let routeInd = 0;
    while (routeInd < route.length && val !== null && val !== undefined) {
        let accessor = route[routeInd];
        val = val[accessor];
        routeInd++;
    }
    if (val === null || val === undefined) {
        val = defaultVal;
    }
    return val;
}
export function extractErrorMessage(e) {
    if (e instanceof Error) {
        // @ts-ignore
        if ((e.errors ?? []).length > 0)
            e = e.errors[0];
        return e.message;
    }
    if (typeof e !== "string")
        return JSON.stringify(e);
    return e;
}
