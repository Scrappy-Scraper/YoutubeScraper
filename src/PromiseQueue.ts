export default class PromiseQueue<TaskInputData, TaskResponseData> {
    private _concurrency: number = 3; // number of tasks that can be in-progress at the same time
    get concurrency() {
        return this._concurrency;
    }

    set concurrency(value: number) {
        this._concurrency = Math.max(1, value);
    }

    reAdjustTaskId: (id: string) => string = ((id: string) => id)

    // worker is the function that process the data
    set worker(value: ((taskInputData: TaskInputData, taskId: string) => Promise<TaskResponseData>)) {
        this._makeWorkerTask = value;
    }

    private _queue: Map<string, TaskInputData> = new Map<string, TaskInputData>(); // taskId => taskInputData // tasks to be taken
    private _inProgressTaskDataSet: Map<string, TaskInputData> = new Map<string, TaskInputData>(); // {taskId: taskInputData} // tasks in-progress
    private _succeededTaskIds: Map<string, number> = new Map<string, number>();     // ids of tasks that are done and succeeded. The key is the task id and val is the added time in Unix Epoch seconds
    private _successIdsExpiry: number = 10 * 60; // time in seconds
    private _failedTaskIds: Map<string, number> = new Map<string, number>();        // ids of tasks that are done and failed. The key is the task id and val is the added time in Unix Epoch seconds
    private _failureIdsExpiry: number = 10 * 60; // time in seconds
    get _allTaskIds(): Set<string> { // set of all task ids ever added
        return new Set([
            ...this._queue.keys(),
            ...this._inProgressTaskDataSet.keys(),
            ...this._succeededTaskIds.keys(),
            ...this._failedTaskIds.keys(),
        ]);
    }

    private _isIdOnRecord(id: string): boolean {
        return this._queue.has(id) || this._inProgressTaskDataSet.has(id) || this._succeededTaskIds.has(id) || this._failedTaskIds.has(id);
    }

    get stats() {
        return {
            pending: Array.from(this._queue.keys()),
            inProgress: Array.from(this._inProgressTaskDataSet.keys()),
            succeeded: Array.from(this._succeededTaskIds.keys()),
            failed: Array.from(this._failedTaskIds.keys()),
        }
    }

    public onTaskSuccess: ((params: InputParam_OnTaskSuccess<TaskInputData, TaskResponseData>) => void) = (() => { /* Default to empty function */ })
    public onTaskFail: ((params: InputParam_OnTaskFail<TaskInputData, TaskResponseData>) => void) = (() => { /* Default to empty function */ })
    public onTaskStart: ((params: BasePromiseQueueCallbackData<TaskInputData, TaskResponseData>) => void) = (() => { /* Default to empty function */ })

    private _makeWorkerTask: ((taskInputData: TaskInputData, taskId: string) => Promise<TaskResponseData>) | null = null;

    public async allDone() {
        let isAllDone = false;

        while (!isAllDone) {
            isAllDone = this._queue.size === 0 && this._inProgressTaskDataSet.size === 0;
            await new Promise(resolve => {
                setTimeout(resolve, 100)
            });
        }
    }

    public enqueue(params: {
        taskInputData: TaskInputData;
        taskId: string;
        logTaskAddedWarning?: boolean;
    }): void {
        let {taskInputData, taskId, logTaskAddedWarning = false} = params;
        if ((taskId ?? null) === null) throw new Error(`taskId is required`);
        taskId = this.reAdjustTaskId(taskId);

        // if added previously, don't add
        let isIdOnRecord = this._isIdOnRecord(taskId);
        if (isIdOnRecord) { // if the id is on the record
            this._removeExpiredHistoryIds(); // remove all the expired ids
            isIdOnRecord = this._isIdOnRecord(taskId); // check again
        }
        if (isIdOnRecord) {
            if (!logTaskAddedWarning) return;
            if (this._queue.has(taskId)) console.warn(`⏭️ Task with id ${taskId} already exists in the queue, so it's not added again`);
            if (this._inProgressTaskDataSet.has(taskId)) console.warn(`⏭️ Task with id ${taskId} is already in progress, so it's not added again`);
            if (this._succeededTaskIds.has(taskId)) console.warn(`⏭️ Task with id ${taskId} had already been worked on, so it's not added again. That task succeeded`);
            if (this._failedTaskIds.has(taskId)) console.warn(`⏭️ Task with id ${taskId} had already been worked on, so it's not added again. That task failed`);
            return;
        }

        // add task to the queue
        this._queue.set(taskId, taskInputData);

        // put task to work
        this._deployWorkers();
    }

    // take out and return the oldest item in the queue
    private _dequeue(): { taskInputData: TaskInputData, taskId: string } | null {
        const taskId: string | null = Array.from(this._queue.keys()).shift() ?? null;
        if (taskId === null) return null;

        const taskInputData: TaskInputData = this._queue.get(taskId)!;
        this._queue.delete(taskId);

        return {taskInputData, taskId}
    }

    private _deployWorkers(): void {
        while (
            this._queue.size > 0 &&                                 // still has pending tasks on queue
            this._inProgressTaskDataSet.size < this._concurrency    // can still add more tasks to in_progress
            ) {
            if (this._makeWorkerTask === null) throw new Error(`PromiseQueue worker is not set. Please set it with PromiseQueue.worker = (taskInputData, taskId) => Promise<TaskResponseData>`)
            const nextTask = this._dequeue(); // take out next pending task from the queue to work on
            if (nextTask === null) return;     // if no pending task left to work on, return
            const {taskInputData, taskId} = nextTask;

            this._inProgressTaskDataSet.set(taskId, taskInputData); // record that task as in_progress
            // callbacks
            const baseCallbackData = {taskInputData, taskId, promiseQueue: this};
            this.onTaskStart(baseCallbackData);

            (async () => {
                let responseData: TaskResponseData;
                try {
                    responseData = await this._makeWorkerTask!(taskInputData, taskId); // create the task worker
                    this._succeededTaskIds.set(taskId, (new Date).getTime() / 1000);               // record it as succeeded
                    this.onTaskSuccess({taskResponse: responseData, ...baseCallbackData}); // call the callback function
                } catch (error) {
                    this._failedTaskIds.set(taskId, (new Date).getTime() / 1000);                  // record it as failed
                    this.onTaskFail({error, ...baseCallbackData});  // call the callback function
                }
                this._inProgressTaskDataSet.delete(taskId);       // remove from list of in_progress tasks
                this._deployWorkers();                            // put remaining queued tasks to in_progress
            })()
        }
    }

    private _removeExpiredHistoryIds(): void {
        const now = (new Date).getTime() / 1000;
        for (const [id, addedTime] of this._succeededTaskIds) {
            if (now - addedTime > this._successIdsExpiry) this._succeededTaskIds.delete(id);
        }
        for (const [id, addedTime] of this._failedTaskIds) {
            if (now - addedTime > this._failureIdsExpiry) this._failedTaskIds.delete(id);
        }
    }
}

export type BasePromiseQueueCallbackData<TaskInputData, TaskResponseData> = {
    taskInputData: TaskInputData,
    taskId: string,
    promiseQueue: PromiseQueue<TaskInputData, TaskResponseData>,
}

type InputParam_OnTaskSuccess<TaskInputData, TaskResponseData> = { taskResponse: TaskResponseData } & BasePromiseQueueCallbackData<TaskInputData, TaskResponseData>;
type InputParam_OnTaskFail<TaskInputData, TaskResponseData> = { error: any } & BasePromiseQueueCallbackData<TaskInputData, TaskResponseData>;
