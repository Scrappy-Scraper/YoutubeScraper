import { sleepAsync } from "./utils.js";
export default class PromiseQueue {
    _concurrency = 3; // number of tasks that can be in-progress at the same time
    get concurrency() { return this._concurrency; }
    set concurrency(value) { this._concurrency = Math.max(1, value); }
    get shouldLogTaskAlreadyAddedWarning() { return this._taskManager.shouldLogTaskAlreadyAddedWarning; }
    set shouldLogTaskAlreadyAddedWarning(value) { this._taskManager.shouldLogTaskAlreadyAddedWarning = value; }
    reAdjustTaskId = ((id) => id); // if the taskId need to be re-adjusted, put in the adjuster here
    // worker is the function that process the data
    set worker(makeWorkerTask) { this._makeWorkerTask = makeWorkerTask; }
    _makeWorkerTask = null;
    // callback functions
    onTaskSuccess = (() => { });
    onTaskFail = (() => { });
    onTaskStart = (() => { });
    // task manager
    _taskManager;
    constructor(params) {
        this._taskManager = params?.taskManager ?? new LocalTaskManager();
    }
    async allDone() {
        const taskManager = this._taskManager;
        let isAllDone = false;
        while (!isAllDone) {
            const { pending, inProgress } = await taskManager.getTaskIds();
            isAllDone = pending.length === 0 && inProgress.length === 0;
            await sleepAsync(100);
        }
    }
    async enqueue(params) {
        const taskId = this.reAdjustTaskId(params.taskId);
        const taskInputData = params.taskInputData;
        await this._taskManager.enqueue({ taskInputData, taskId });
        await this._deployWorkers();
    }
    async _deployWorkers() {
        const taskManager = this._taskManager;
        const taskIds = await taskManager.getTaskIds();
        while (taskIds.pending.length > 0 && // still has pending tasks
            taskIds.inProgress.length < this._concurrency // can still add more tasks to in_progress
        ) {
            if (this._makeWorkerTask === null)
                throw new Error(`PromiseQueue worker is not set. Please set it with PromiseQueue.worker = (taskInputData, taskId) => Promise<TaskResponseData>`);
            const nextTask = await taskManager.dequeue(); // take out next pending task from the queue to work on
            if (nextTask === null)
                return; // if no pending task left to work on, return
            const { taskInputData, taskId } = nextTask;
            await taskManager.addTaskToInProgress(taskId, taskInputData); // record that task as in_progress
            // callbacks
            const baseCallbackData = { taskInputData, taskId, promiseQueue: this };
            this.onTaskStart(baseCallbackData);
            (async () => {
                try {
                    let responseData = await this._makeWorkerTask(taskInputData, taskId); // create the task and wait for result
                    await taskManager.addTaskToSucceeded(taskId); // record it as succeeded
                    this.onTaskSuccess({ taskResponse: responseData, ...baseCallbackData }); // call the callback function
                }
                catch (error) {
                    await taskManager.addTaskToFailed(taskId); // record it as failed
                    this.onTaskFail({ error, ...baseCallbackData }); // call the callback function
                }
                await taskManager.removeTaskFromInProgress(taskId); // remove from list of in_progress tasks
                await this._deployWorkers(); // put remaining queued tasks to in_progress
            })();
        }
    }
}
class AbstractTaskManager {
    // add task to pending
    enqueue(params) {
        return (async () => {
            let { taskInputData, taskId } = params;
            if ((taskId ?? null) === null)
                throw new Error(`taskId is required`);
            let taskIds = await this.getTaskIds();
            // if added previously, don't add
            let isIdOnRecord = isTaskIdOnRecord(taskId, taskIds);
            if (isIdOnRecord) { // if the id is on the record
                await this.removeExpiredHistoryIds(); // remove all the expired ids
                taskIds = await this.getTaskIds(); // task ids after the removal of expired ids
                isIdOnRecord = isTaskIdOnRecord(taskId, taskIds); // check again
            }
            if (isIdOnRecord) {
                if (!this.shouldLogTaskAlreadyAddedWarning)
                    return;
                if (taskIds.pending.includes(taskId))
                    console.warn(`⏭️ Task with id ${taskId} already exists in the queue, so it's not added again`);
                if (taskIds.inProgress.includes(taskId))
                    console.warn(`⏭️ Task with id ${taskId} is already in progress, so it's not added again`);
                if (taskIds.succeeded.includes(taskId))
                    console.warn(`⏭️ Task with id ${taskId} had already been worked on, so it's not added again. That task succeeded`);
                if (taskIds.failed.includes(taskId))
                    console.warn(`⏭️ Task with id ${taskId} had already been worked on, so it's not added again. That task failed`);
                return;
            }
            // add task to the queue
            await this.addTaskToPending(taskId, taskInputData);
        })();
    }
    // take out and return the oldest item in the queue
    dequeue() {
        return (async () => {
            const taskId = Array.from(await this.getPendingTaskIds()).shift() ?? null;
            if (taskId === null)
                return null;
            const taskInputData = await this.removeTaskFromPending(taskId);
            return { taskInputData, taskId };
        })();
    }
    getTaskIds() {
        return (async () => {
            const [pending, inProgress, succeeded, failed] = await Promise.all([
                this.getPendingTaskIds(),
                this.getInProgressTaskIds(),
                this.getSucceededTaskIds(),
                this.getFailedTaskIds(),
            ]);
            return { pending, inProgress, succeeded, failed };
        })();
    }
    _shouldLogTaskAlreadyAddedWarning = false;
    get shouldLogTaskAlreadyAddedWarning() { return this._shouldLogTaskAlreadyAddedWarning; }
    set shouldLogTaskAlreadyAddedWarning(value) { this._shouldLogTaskAlreadyAddedWarning = value; }
}
class LocalTaskManager extends AbstractTaskManager {
    // Pending Tasks
    _pendingTasks = new Map(); // taskId => taskInputData
    async getPendingTaskIds() {
        return Array.from(this._pendingTasks.keys());
    }
    async addTaskToPending(taskId, taskInputData) {
        this._pendingTasks.set(taskId, taskInputData);
    }
    async removeTaskFromPending(taskId) {
        const taskInputData = this._pendingTasks.get(taskId);
        this._pendingTasks.delete(taskId);
        return taskInputData;
    }
    // In-Progress Tasks
    _inProgressTasks = new Map(); // taskId => taskInputData
    async getInProgressTaskIds() {
        return Array.from(this._inProgressTasks.keys());
    }
    async addTaskToInProgress(taskId, taskInputData) {
        this._inProgressTasks.set(taskId, { startTime: Date.now() / 1000, taskInputData });
    }
    async removeTaskFromInProgress(taskId) {
        const record = this._inProgressTasks.get(taskId);
        if (record === undefined || record === null)
            return null;
        const { taskInputData } = record;
        this._inProgressTasks.delete(taskId);
        return taskInputData;
    }
    async moveOldTasksBackToPending(ageInSeconds) {
        const now = Date.now() / 1000;
        const taskIds = Array.from(this._inProgressTasks.keys());
        const tasksToMove = taskIds.filter(id => now - this._inProgressTasks.get(id).startTime > ageInSeconds);
        for (const id of tasksToMove) {
            const taskInputData = this._inProgressTasks.get(id).taskInputData;
            await this.addTaskToPending(id, taskInputData);
            await this.removeTaskFromInProgress(id);
        }
    }
    // Succeeded Tasks
    _succeededTaskIds = new Map(); // ids of tasks that are done and succeeded. The key is the task id and val is the added time in Unix Epoch seconds
    async getSucceededTaskIds() {
        return Array.from(this._succeededTaskIds.keys());
    }
    async addTaskToSucceeded(taskId) {
        this._succeededTaskIds.set(taskId, Date.now() / 1000);
    }
    async removeTaskFromSucceeded(taskId) {
        this._succeededTaskIds.delete(taskId);
    }
    // Failed Task Ids
    _failedTaskIds = new Map(); // ids of tasks that are done and failed. The key is the task id and val is the added time in Unix Epoch seconds
    async getFailedTaskIds() {
        return Array.from(this._failedTaskIds.keys());
    }
    async addTaskToFailed(taskId) {
        this._failedTaskIds.set(taskId, Date.now() / 1000);
    }
    async removeTaskFromFailed(taskId) {
        this._failedTaskIds.delete(taskId);
    }
    // Succeeded Task Ids Expiry
    _successIdsExpiry = 10 * 60; // time in seconds
    async getSuccessIdsExpiry() { return this._successIdsExpiry; }
    async setSuccessIdsExpiry(value) {
        this._successIdsExpiry = Math.max(0, parseInt(value.toString(), 10));
    }
    // Failed Task Ids Expiry
    _failureIdsExpiry = 10 * 60; // time in seconds
    async getFailureIdsExpiry() { return this._failureIdsExpiry; }
    async setFailureIdsExpiry(value) {
        this._failureIdsExpiry = Math.max(0, parseInt(value.toString(), 10));
    }
    async removeExpiredHistoryIds() {
        const now = Date.now() / 1000;
        const succeededTaskIds = Array.from(this._succeededTaskIds.keys());
        const failedTaskIds = Array.from(this._failedTaskIds.keys());
        const succeededTaskIdsToRemove = succeededTaskIds.filter(id => now - this._succeededTaskIds.get(id) > this._successIdsExpiry);
        const failedTaskIdsToRemove = failedTaskIds.filter(id => now - this._failedTaskIds.get(id) > this._failureIdsExpiry);
        for (const id of succeededTaskIdsToRemove) {
            this._succeededTaskIds.delete(id);
        }
        for (const id of failedTaskIdsToRemove) {
            this._failedTaskIds.delete(id);
        }
    }
}
function isTaskIdOnRecord(id, taskIds) {
    const { pending, inProgress, succeeded, failed } = taskIds;
    return pending.includes(id) || inProgress.includes(id) || succeeded.includes(id) || failed.includes(id);
}
