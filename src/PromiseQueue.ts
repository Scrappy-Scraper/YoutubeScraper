import {sleepAsync} from "./utils.js";

export default class PromiseQueue<TaskInputData, TaskResponseData> {
    private _concurrency: number = 3; // number of tasks that can be in-progress at the same time
    get concurrency() { return this._concurrency; }
    set concurrency(value: number) { this._concurrency = Math.max(1, value); }

    get shouldLogTaskAlreadyAddedWarning() { return this._taskManager.shouldLogTaskAlreadyAddedWarning; }
    set shouldLogTaskAlreadyAddedWarning(value: boolean) { this._taskManager.shouldLogTaskAlreadyAddedWarning = value; }

    reAdjustTaskId: (id: string) => string = ((id: string) => id); // if the taskId need to be re-adjusted, put in the adjuster here

    // worker is the function that process the data
    set worker(makeWorkerTask: ((taskInputData: TaskInputData, taskId: string) => Promise<TaskResponseData>)) { this._makeWorkerTask = makeWorkerTask; }
    private _makeWorkerTask: ((taskInputData: TaskInputData, taskId: string) => Promise<TaskResponseData>) | null = null;

    // callback functions
    public onTaskSuccess: ((params: InputParam_OnTaskSuccess<TaskInputData, TaskResponseData>) => void) = (() => { /* Default to empty function */ })
    public onTaskFail: ((params: InputParam_OnTaskFail<TaskInputData, TaskResponseData>) => void) = (() => { /* Default to empty function */ })
    public onTaskStart: ((params: BasePromiseQueueCallbackData<TaskInputData, TaskResponseData>) => void) = (() => { /* Default to empty function */ })

    // task manager
    protected _taskManager: AbstractTaskManager<TaskInputData>;
    constructor(params?: {taskManager?: AbstractTaskManager<TaskInputData>}) {
        this._taskManager = params?.taskManager ?? new LocalTaskManager<TaskInputData>();
    }

    public async allDone() {
        const taskManager = this._taskManager;
        let isAllDone = false;

        while (!isAllDone) {
            const {pending, inProgress} = await taskManager.getTaskIds();
            isAllDone = pending.length === 0 && inProgress.length === 0;
            await sleepAsync(100);
        }
    }

    public async enqueue(params: { taskInputData: TaskInputData; taskId: string; }) {
        const taskId = this.reAdjustTaskId(params.taskId);
        const taskInputData = params.taskInputData;
        await this._taskManager.enqueue({taskInputData, taskId});
        await this._deployWorkers();
    }
    private async _deployWorkers(): Promise<void> {
        const taskManager = this._taskManager;
        const taskIds = await taskManager.getTaskIds();
        while (
            taskIds.pending.length > 0 &&                                 // still has pending tasks
            taskIds.inProgress.length < this._concurrency    // can still add more tasks to in_progress
        ) {
            if (this._makeWorkerTask === null) throw new Error(`PromiseQueue worker is not set. Please set it with PromiseQueue.worker = (taskInputData, taskId) => Promise<TaskResponseData>`)
            const nextTask = await taskManager.dequeue(); // take out next pending task from the queue to work on
            if (nextTask === null) return;     // if no pending task left to work on, return
            const {taskInputData, taskId} = nextTask;

            await taskManager.addTaskToInProgress(taskId, taskInputData); // record that task as in_progress

            // callbacks
            const baseCallbackData = {taskInputData, taskId, promiseQueue: this};
            this.onTaskStart(baseCallbackData);

            (async () => {
                try {
                    let responseData: TaskResponseData = await this._makeWorkerTask!(taskInputData, taskId); // create the task and wait for result
                    await taskManager.addTaskToSucceeded(taskId); // record it as succeeded
                    this.onTaskSuccess({taskResponse: responseData, ...baseCallbackData}); // call the callback function
                } catch (error) {
                    await taskManager.addTaskToFailed(taskId); // record it as failed
                    this.onTaskFail({error, ...baseCallbackData});  // call the callback function
                }
                await taskManager.removeTaskFromInProgress(taskId); // remove from list of in_progress tasks
                await this._deployWorkers(); // put remaining queued tasks to in_progress
            })();
        }
    }
}

export type BasePromiseQueueCallbackData<TaskInputData, TaskResponseData> = {
    taskInputData: TaskInputData,
    taskId: string,
    promiseQueue: PromiseQueue<TaskInputData, TaskResponseData>,
}

export type InputParam_OnTaskSuccess<TaskInputData, TaskResponseData> = { taskResponse: TaskResponseData } & BasePromiseQueueCallbackData<TaskInputData, TaskResponseData>;
export type InputParam_OnTaskFail<TaskInputData, TaskResponseData> = { error: any } & BasePromiseQueueCallbackData<TaskInputData, TaskResponseData>;


abstract class AbstractTaskManager<TaskInputData> {
    // add task to pending
    enqueue(params: { taskInputData: TaskInputData; taskId: string; }): Promise<void> {
        return (async () => {
            let {taskInputData, taskId} = params;
            if ((taskId ?? null) === null) throw new Error(`taskId is required`);
            let taskIds = await this.getTaskIds();

            // if added previously, don't add
            let isIdOnRecord = isTaskIdOnRecord(taskId, taskIds);
            if (isIdOnRecord) { // if the id is on the record
                await this.removeExpiredHistoryIds(); // remove all the expired ids
                taskIds = await this.getTaskIds(); // task ids after the removal of expired ids
                isIdOnRecord = isTaskIdOnRecord(taskId, taskIds); // check again
            }
            if (isIdOnRecord) {
                if (!this.shouldLogTaskAlreadyAddedWarning) return;
                if (taskIds.pending.includes(taskId)) console.warn(`⏭️ Task with id ${taskId} already exists in the queue, so it's not added again`);
                if (taskIds.inProgress.includes(taskId)) console.warn(`⏭️ Task with id ${taskId} is already in progress, so it's not added again`);
                if (taskIds.succeeded.includes(taskId)) console.warn(`⏭️ Task with id ${taskId} had already been worked on, so it's not added again. That task succeeded`);
                if (taskIds.failed.includes(taskId)) console.warn(`⏭️ Task with id ${taskId} had already been worked on, so it's not added again. That task failed`);
                return;
            }

            // add task to the queue
            await this.addTaskToPending(taskId, taskInputData);
        })()
    }

    // take out and return the oldest item in the queue
    dequeue(): Promise<{ taskInputData: TaskInputData, taskId: string } | null> {
        return (async () => {
            const taskId: string | null = Array.from(await this.getPendingTaskIds()).shift() ?? null;
            if (taskId === null) return null;

            const taskInputData: TaskInputData = await this.removeTaskFromPending(taskId);

            return {taskInputData, taskId}
        })()
    }

    public abstract getPendingTaskIds(): Promise<string[]>;
    public abstract addTaskToPending(taskId: string, taskInputData: TaskInputData): Promise<void>;
    public abstract removeTaskFromPending(taskId: string): Promise<TaskInputData>;

    public abstract getInProgressTaskIds(): Promise<string[]>;
    public abstract addTaskToInProgress(taskId: string, taskInputData: TaskInputData): Promise<void>;
    public abstract removeTaskFromInProgress(taskId: string): Promise<TaskInputData|null>;
    public abstract moveOldTasksBackToPending(ageInSeconds: number): Promise<void>;

    public abstract getSucceededTaskIds(): Promise<string[]>;
    public abstract addTaskToSucceeded(taskId: string): Promise<void>;
    public abstract removeTaskFromSucceeded(taskId: string): Promise<void>;

    public abstract getFailedTaskIds(): Promise<string[]>;
    public abstract addTaskToFailed(taskId: string): Promise<void>;
    public abstract removeTaskFromFailed(taskId: string): Promise<void>;

    public abstract getSuccessIdsExpiry(): Promise<number>;
    public abstract setSuccessIdsExpiry(value: number): Promise<void>;
    public abstract getFailureIdsExpiry(): Promise<number>;
    public abstract setFailureIdsExpiry(value: number): Promise<void>;

    public getTaskIds(): Promise<TaskIds> {
        return (async () => {
            const [pending, inProgress, succeeded, failed] = await Promise.all([
                this.getPendingTaskIds(),
                this.getInProgressTaskIds(),
                this.getSucceededTaskIds(),
                this.getFailedTaskIds(),
            ]);
            return {pending, inProgress, succeeded, failed};
        })()
    }

    private _shouldLogTaskAlreadyAddedWarning: boolean = false;
    get shouldLogTaskAlreadyAddedWarning() { return this._shouldLogTaskAlreadyAddedWarning; }
    set shouldLogTaskAlreadyAddedWarning(value: boolean) { this._shouldLogTaskAlreadyAddedWarning = value; }


    public abstract removeExpiredHistoryIds(): Promise<void>;
}

class LocalTaskManager<TaskInputData> extends AbstractTaskManager<TaskInputData> {
    // Pending Tasks
    private _pendingTasks: Map<string, TaskInputData> = new Map<string, TaskInputData>(); // taskId => taskInputData
    async getPendingTaskIds(): Promise<string[]> {
        return Array.from(this._pendingTasks.keys());
    }
    async addTaskToPending(taskId: string, taskInputData: TaskInputData): Promise<void> {
        this._pendingTasks.set(taskId, taskInputData);
    }
    async removeTaskFromPending(taskId: string): Promise<TaskInputData> {
        const taskInputData = this._pendingTasks.get(taskId);
        this._pendingTasks.delete(taskId);
        return taskInputData!;
    }

    // In-Progress Tasks
    private _inProgressTasks: Map<string, {startTime: number, taskInputData: TaskInputData}> = new Map<string, {startTime: number, taskInputData: TaskInputData}>(); // taskId => taskInputData
    async getInProgressTaskIds(): Promise<string[]> {
        return Array.from(this._inProgressTasks.keys());
    }
    async addTaskToInProgress(taskId: string, taskInputData: TaskInputData): Promise<void> {
        this._inProgressTasks.set(taskId, {startTime: Date.now() / 1000, taskInputData});
    }
    async removeTaskFromInProgress(taskId: string): Promise<TaskInputData|null> {
        const record = this._inProgressTasks.get(taskId);
        if (record === undefined || record === null) return null;
        const {taskInputData} = record;
        this._inProgressTasks.delete(taskId);
        return taskInputData!;
    }
    async moveOldTasksBackToPending(ageInSeconds: number): Promise<void> {
        const now = Date.now() / 1000;
        const taskIds = Array.from(this._inProgressTasks.keys());
        const tasksToMove = taskIds.filter(id => now - this._inProgressTasks.get(id)!.startTime > ageInSeconds);
        for (const id of tasksToMove) {
            const taskInputData = this._inProgressTasks.get(id)!.taskInputData;
            await this.addTaskToPending(id, taskInputData);
            await this.removeTaskFromInProgress(id);
        }
    }

    // Succeeded Tasks
    private _succeededTaskIds: Map<string, number> = new Map<string, number>(); // ids of tasks that are done and succeeded. The key is the task id and val is the added time in Unix Epoch seconds
    async getSucceededTaskIds(): Promise<string[]> {
        return Array.from(this._succeededTaskIds.keys());
    }
    async addTaskToSucceeded(taskId: string): Promise<void> {
        this._succeededTaskIds.set(taskId, Date.now() / 1000);
    }
    async removeTaskFromSucceeded(taskId: string): Promise<void> {
        this._succeededTaskIds.delete(taskId);
    }

    // Failed Task Ids
    private _failedTaskIds: Map<string, number> = new Map<string, number>(); // ids of tasks that are done and failed. The key is the task id and val is the added time in Unix Epoch seconds
    async getFailedTaskIds(): Promise<string[]> {
        return Array.from(this._failedTaskIds.keys());
    }
    async addTaskToFailed(taskId: string): Promise<void> {
        this._failedTaskIds.set(taskId, Date.now() / 1000);
    }
    async removeTaskFromFailed(taskId: string): Promise<void> {
        this._failedTaskIds.delete(taskId);
    }

    // Succeeded Task Ids Expiry
    private _successIdsExpiry: number = 10 * 60; // time in seconds
    async getSuccessIdsExpiry(): Promise<number> { return this._successIdsExpiry }
    async setSuccessIdsExpiry(value: number): Promise<void> {
        this._successIdsExpiry = Math.max(0, parseInt(value.toString(), 10));
    }

    // Failed Task Ids Expiry
    private _failureIdsExpiry: number = 10 * 60; // time in seconds
    async getFailureIdsExpiry(): Promise<number> { return this._failureIdsExpiry }
    async setFailureIdsExpiry(value: number): Promise<void> {
        this._failureIdsExpiry = Math.max(0, parseInt(value.toString(), 10));
    }

    async removeExpiredHistoryIds() {
        const now = Date.now() / 1000;
        const succeededTaskIds = Array.from(this._succeededTaskIds.keys());
        const failedTaskIds = Array.from(this._failedTaskIds.keys());
        const succeededTaskIdsToRemove = succeededTaskIds.filter(id => now - this._succeededTaskIds.get(id)! > this._successIdsExpiry);
        const failedTaskIdsToRemove = failedTaskIds.filter(id => now - this._failedTaskIds.get(id)! > this._failureIdsExpiry);
        for (const id of succeededTaskIdsToRemove) {
            this._succeededTaskIds.delete(id);
        }
        for (const id of failedTaskIdsToRemove) {
            this._failedTaskIds.delete(id);
        }
    }
}

type TaskIds = {pending: string[], inProgress: string[], succeeded: string[], failed: string[]}
function isTaskIdOnRecord(id: string, taskIds: TaskIds): boolean {
    const {pending, inProgress, succeeded, failed} = taskIds;

    return pending.includes(id) || inProgress.includes(id) || succeeded.includes(id) || failed.includes(id);
}
