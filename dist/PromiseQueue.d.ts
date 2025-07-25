export default class PromiseQueue<TaskInputData, TaskResponseData> {
    private _concurrency;
    get concurrency(): number;
    set concurrency(value: number);
    get shouldLogTaskAlreadyAddedWarning(): boolean;
    set shouldLogTaskAlreadyAddedWarning(value: boolean);
    reAdjustTaskId: (id: string) => string;
    set worker(makeWorkerTask: ((taskInputData: TaskInputData, taskId: string) => Promise<TaskResponseData>));
    private _makeWorkerTask;
    onTaskSuccess: ((params: InputParam_OnTaskSuccess<TaskInputData, TaskResponseData>) => Promise<void>);
    onTaskFail: ((params: InputParam_OnTaskFail<TaskInputData, TaskResponseData>) => Promise<void>);
    onTaskStart: ((params: BasePromiseQueueCallbackData<TaskInputData, TaskResponseData>) => Promise<void>);
    protected _taskManager: AbstractTaskManager<TaskInputData>;
    constructor(params?: {
        taskManager?: AbstractTaskManager<TaskInputData>;
    });
    allDone(): Promise<void>;
    enqueue(params: {
        taskInputData: TaskInputData;
        taskId: string;
    }): Promise<void>;
    private _deployWorkers;
}
export type BasePromiseQueueCallbackData<TaskInputData, TaskResponseData> = {
    taskInputData: TaskInputData;
    taskId: string;
    promiseQueue: PromiseQueue<TaskInputData, TaskResponseData>;
};
export type InputParam_OnTaskSuccess<TaskInputData, TaskResponseData> = {
    taskResponse: TaskResponseData;
} & BasePromiseQueueCallbackData<TaskInputData, TaskResponseData>;
export type InputParam_OnTaskFail<TaskInputData, TaskResponseData> = {
    error: any;
} & BasePromiseQueueCallbackData<TaskInputData, TaskResponseData>;
declare abstract class AbstractTaskManager<TaskInputData> {
    enqueue(params: {
        taskInputData: TaskInputData;
        taskId: string;
    }): Promise<void>;
    dequeue(): Promise<{
        taskInputData: TaskInputData;
        taskId: string;
    } | null>;
    abstract getPendingTaskIds(): Promise<string[]>;
    abstract addTaskToPending(taskId: string, taskInputData: TaskInputData): Promise<void>;
    abstract removeTaskFromPending(taskId: string): Promise<TaskInputData>;
    abstract getInProgressTaskIds(): Promise<string[]>;
    abstract addTaskToInProgress(taskId: string, taskInputData: TaskInputData): Promise<void>;
    abstract removeTaskFromInProgress(taskId: string): Promise<TaskInputData | null>;
    abstract moveOldTasksBackToPending(ageInSeconds: number): Promise<void>;
    abstract getSucceededTaskIds(): Promise<string[]>;
    abstract addTaskToSucceeded(taskId: string): Promise<void>;
    abstract removeTaskFromSucceeded(taskId: string): Promise<void>;
    abstract getFailedTaskIds(): Promise<string[]>;
    abstract addTaskToFailed(taskId: string): Promise<void>;
    abstract removeTaskFromFailed(taskId: string): Promise<void>;
    abstract getSuccessIdsExpiry(): Promise<number>;
    abstract setSuccessIdsExpiry(value: number): Promise<void>;
    abstract getFailureIdsExpiry(): Promise<number>;
    abstract setFailureIdsExpiry(value: number): Promise<void>;
    getTaskIds(): Promise<TaskIds>;
    private _shouldLogTaskAlreadyAddedWarning;
    get shouldLogTaskAlreadyAddedWarning(): boolean;
    set shouldLogTaskAlreadyAddedWarning(value: boolean);
    abstract removeExpiredHistoryIds(): Promise<void>;
}
type TaskIds = {
    pending: string[];
    inProgress: string[];
    succeeded: string[];
    failed: string[];
};
export {};
