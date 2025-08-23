import axios, {AxiosRequestConfig} from "axios";

export const sleepAsync = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function raceRequests(params: {
    generateRequest: () => Promise<any>;
    amount: number;
    waitTime?: number; // time in seconds
}) {
    const {generateRequest, amount, waitTime} = params;
    if (amount === 0) throw new Error('Amount of requests must be greater than 0');

    const tasks: Promise<any>[] = [];
    let isDone = false;
    for (let ind = 0; ind < amount; ind++) {
        if (isDone) break; // if one of the existing is done successfully, stop adding new tasks
        const task = generateRequest();
        tasks.push(task);
        task
            .then(() => {isDone = true;})
            .catch(() => {});

        if(waitTime) {
            let waitStart = new Date().getTime();
            let sleepDuration = Math.max(10, waitTime / 100 * 1000); // at least 10 ms
            while (new Date().getTime() - waitStart < waitTime * 1000) {
                if(isDone) return Promise.any(tasks);
                await sleepAsync(sleepDuration);
            }
        }
    }
    return Promise.any(tasks);
}

export async function makeHttpRequest(params: {
    url: string;
    proxyUrl?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'CONNECT' | 'TRACE';
    requestData?: string;
    headers?: any;
    timeout?: number;
}): Promise<{ text: string; status: number; proxyUrl?: string }> {
    const {url, proxyUrl, method = 'GET', requestData, headers = {}, timeout = 30000} = params;

    try {
        // Prepare axios config
        const axiosConfig: AxiosRequestConfig = {
            url,
            method,
            timeout,
            headers: {
                'Accept-Language': 'en-US',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                ...headers,
            },
            // Disable automatic response validation to handle non-2xx status codes manually
            validateStatus: () => true,
        };

        // Add request data for POST/PUT methods
        if (requestData) {
            axiosConfig.data = requestData;
            axiosConfig.headers!['Content-Type'] = axiosConfig.headers!['Content-Type'] || 'application/json';
        }

        // Handle proxy configuration
        if (proxyUrl) {
            const {HttpsProxyAgent} = await import('https-proxy-agent');
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
    } catch (error) {
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

export function unescapeHtml(text: string): string {
    const entities: { [key: string]: string } = {
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
export function getJsonFromHtml(html: string, key: string, numChars: number = 2, stop: string = '"'): string {
    const startPos = html.indexOf(key) + key.length + numChars;
    const endPos = html.indexOf(stop, startPos);
    return html.substring(startPos, endPos);
}

// Find a specific key in nested object
export function findInObject(obj: any, searchKey: string): any {
    const queue: any[] = [obj];

    while (queue.length > 0) {
        const current = queue.shift();

        if (current && typeof current === 'object') {
            if (Array.isArray(current)) {
                queue.push(...current);
            } else {
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

export function getAllDescendantObjects(params: {
    rootNode: ObjNode;
    isMatch: (params: { node: ObjNode; parentKey?: string | null }) => boolean;
    parentKey?: string | null | undefined;
}): { [key in string]: any }[] {
    const {rootNode, isMatch, parentKey = null} = params;

    if (Array.isArray(rootNode)) {
        return rootNode.flatMap((node) => getAllDescendantObjects({rootNode: node, isMatch, parentKey}));
    }

    if (typeof rootNode !== 'object' || rootNode === null) return [];

    const descendantNodes: { [key in string]: any }[] = [];
    for (const [key, value] of Object.entries(rootNode)) {
        // go over this root node's children
        const matched = isMatch({
            node: value,
            parentKey,
        });
        if (matched) descendantNodes.push(value);
        descendantNodes.push(...getAllDescendantObjects({rootNode: value, isMatch, parentKey: key}));
    }
    return descendantNodes;
}

export type ObjNode = { [key in string]: any } | ObjNode[] | number | boolean | string | null | undefined;

export function isTrue(val: any){
    if(typeof val === "string"){
        const lower = val.toLowerCase();
        return (lower === "true" || lower === "yes" || lower === "1" || lower === "t");
    } else if(typeof val === "boolean"){
        return val;
    } else if(typeof val === "number"){
        return val === 1;
    }
    return false;
}


export function fallbackValue<T>(val: any, path: string|null = null, defaultVal: T|null = null): T|null {
    let route: string[] = [];

    if (path !== null) {
        let paths: string[] = path.split(".");
        paths.forEach((currentPath) => {
            let leftSquareBracketInd = currentPath.indexOf("[");
            let rightSquareBracketInd = currentPath.indexOf("]");

            if (leftSquareBracketInd === -1) {
                route.push(currentPath)
            } else {
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
