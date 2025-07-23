export default class PromiseQueue<TaskInputData, TaskResponseData> {
    private _concurrency;
    get concurrency(): number;
    set concurrency(value: number);
    reAdjustTaskId: (id: string) => string;
    set worker(value: ((taskInputData: TaskInputData, taskId: string) => Promise<TaskResponseData>));
    private _queue;
    private _inProgressTaskDataSet;
    private _succeededTaskIds;
    private _successIdsExpiry;
    private _failedTaskIds;
    private _failureIdsExpiry;
    get _allTaskIds(): Set<string>;
    private _isIdOnRecord;
    get stats(): {
        pending: string[];
        inProgress: string[];
        succeeded: string[];
        failed: string[];
    };
    onTaskSuccess: ((params: {
        taskResponse: TaskResponseData;
    } & BasePromiseQueueCallbackData<TaskInputData, TaskResponseData>) => void);
    onTaskFail: ((params: {
        error: any;
    } & BasePromiseQueueCallbackData<TaskInputData, TaskResponseData>) => void);
    onTaskStart: ((params: BasePromiseQueueCallbackData<TaskInputData, TaskResponseData>) => void);
    private _makeWorkerTask;
    allDone(): Promise<void>;
    enqueue(params: {
        taskInputData: TaskInputData;
        taskId: string;
        logTaskAddedWarning?: boolean;
    }): void;
    private _dequeue;
    private _deployWorkers;
    private _removeExpiredHistoryIds;
}
export type BasePromiseQueueCallbackData<TaskInputData, TaskResponseData> = {
    taskInputData: TaskInputData;
    taskId: string;
    promiseQueue: PromiseQueue<TaskInputData, TaskResponseData>;
};
