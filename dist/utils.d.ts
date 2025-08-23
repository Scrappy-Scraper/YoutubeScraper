export declare const sleepAsync: (ms: number) => Promise<unknown>;
export declare function raceRequests(params: {
    generateRequest: () => Promise<any>;
    amount: number;
    waitTime?: number;
}): Promise<any>;
export declare function makeHttpRequest(params: {
    url: string;
    proxyUrl?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'CONNECT' | 'TRACE';
    requestData?: string;
    headers?: any;
    timeout?: number;
}): Promise<{
    text: string;
    status: number;
    proxyUrl?: string;
}>;
export declare function unescapeHtml(text: string): string;
export declare function getJsonFromHtml(html: string, key: string, numChars?: number, stop?: string): string;
export declare function findInObject(obj: any, searchKey: string): any;
export declare function getAllDescendantObjects(params: {
    rootNode: ObjNode;
    isMatch: (params: {
        node: ObjNode;
        parentKey?: string | null;
    }) => boolean;
    parentKey?: string | null | undefined;
}): {
    [key in string]: any;
}[];
export type ObjNode = {
    [key in string]: any;
} | ObjNode[] | number | boolean | string | null | undefined;
export declare function isTrue(val: any): boolean;
export declare function fallbackValue<T>(val: any, path?: string | null, defaultVal?: T | null): T | null;
