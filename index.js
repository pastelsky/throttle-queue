const Job = {
  status: {
    READY: Symbol("ready"),
    PROCESSING: Symbol("processing")
  },

  priority: {
    LOW: 5,
    MEDIUM: 10,
    HIGH: 20
  }
};

/**
 * A simple promise based throttle queue with support
 * for priorities, concurrency control, job de-duplication,
 * and more.
 */
class Queue {
  constructor(options) {
    this.jobs = [];
    this.options = {
      concurrency: 1,
      aging: true,
      maxAge: Number.POSITIVE_INFINITY,
      ...options
    };
  }

  /**
   * @callback executorCallback
   * @param {Object} params
   */

  /**
   * Set a function (async or sync) that
   * executes the jobs sent to the queue.
   * This function is passed a params object.
   * @param {executorCallback} executor
   */
  setExecutor(executor) {
    this.executor = executor;
  }

  hasJob(id) {
    return this.jobs.some(job => job.id === id);
  }

  getRunningJobs() {
    return this.jobs.filter(job => job.status === Job.status.PROCESSING);
  }

  getReadyJobs() {
    return this.jobs.filter(job => job.status === Job.status.READY);
  }

  /**
   * Remove "ready" jobs from the queue that have
   * lived past their max age. Removed jobs have
   * their failure listeners notified of the same.
   */
  pruneQueue() {
    this.getReadyJobs().forEach(job => {
      const { addedTime, maxAge, failureListeners } = job;
      const isJobExpired = (addedTime.getTime() + maxAge) * 1000 < Date.now();

      if (isJobExpired) {
        failureListeners.forEach(listener => {
          listener({
            code: "JOB_EXPIRED",
            message:
              "This job's age exceeded it's specified maxAge, and was dropped"
          });
        });
      }
    });
  }

  /**
   * Get the next "ready" job from the queue
   * to be executed. The next ready job depends on -
   * 1) Priority: higher priority always executes first
   * 2) Time Added: if priorities are equal, the older
   * job executes first.
   */
  getNextJobToRun() {
    return this.jobs
      .filter(job => job.status === Job.status.READY)
      .sort((jobA, jobB) => {
        const priorityDiff = jobB.priority - jobA.priority;
        if (priorityDiff) {
          return jobB.priority - jobA.priority;
        }
        return jobA.addedTime.getTime() - jobB.addedTime.getTime();
      })
      .shift();
  }

  /**
   * Increments the priorites of "ready" jobs
   * in the queue to prevent starvation of lower
   * priority jobs.
   */
  ageJobs() {
    this.jobs.filter(job => job.status === Job.status.READY).forEach(job => {
      job.priority += 1;
    });
  }

  removeJob(id) {
    this.jobs = this.jobs.filter(job => job.id !== id);
  }

  /**
   * Clear the queue of all "ready" jobs. Jobs
   * in execution are not terminate prematurely.
   * Jobs being terminated have their failure listeners notified.
   */
  clear() {
    this.jobs.filter(job => job.status === Job.status.READY).forEach(job => {
      job.failureListeners.forEach(failureListener => {
        failureListener({
          code: "QUEUE_CLEARED",
          message: "This job was terminated since the queue was cleared",
          job
        });
      });
    });
    this.jobs = [];
  }

  setJobToProcessing(id) {
    this.jobs.forEach(job => {
      if (job.id === id) {
        job.status = Job.status.PROCESSING;
      }
    });
  }

  /**
   * Executes the next job in queue iff
   * they haven't expired and concurrency
   * limit is not already achieved.
   */
  executeNextJobIfPossible() {
    if (!this.getReadyJobs().length) {
      return;
    }

    if (this.getRunningJobs().length < this.options.concurrency) {
      if (this.options.aging) {
        this.ageJobs();
      }
      this.pruneQueue();
      this.executeNextJob();
    } else {
    }
  }

  executeNextJob() {
    const nextJob = this.getNextJobToRun();

    this.setJobToProcessing(nextJob.id);
    const callResult = this.executor.call(this, nextJob.params);

    Promise.resolve(callResult)
      .then(result => {
        nextJob.successListeners.forEach(listener => {
          listener.call(this, result);
        });

        this.removeJob(nextJob.id);
        this.executeNextJobIfPossible();
      })
      .catch(err => {
        nextJob.failureListeners.forEach(listener => {
          listener.call(this, err);
        });

        this.removeJob(nextJob.id);
        this.executeNextJobIfPossible();
      });
  }

  addListenersToJob(id, { resolve, reject }) {
    this.jobs.forEach(job => {
      if (job.id === id) {
        job.successListeners.push(resolve);
        job.failureListeners.push(reject);
      }
    });
  }

  getRandomId() {
    return Math.random().toString(16);
  }

  /**
   *
   * @param {string|number} id
   * @param {Object} jobParams
   * @param {Object} options
   * @return {Promise<any>}
   */
  process(jobParams, id, options = {}) {
    const {
      priority = Job.priority.LOW,
      maxAge = this.options.maxAge
    } = options;

    return new Promise((resolve, reject) => {
      // If a job with the given id already exists,
      // just add the success / failure callbacks to
      // that existing job (dedup)
      if (this.hasJob(id)) {
        this.addListenersToJob(id, { resolve, reject });
        return;
      }

      this.jobs.push({
        id,
        maxAge,
        priority,
        addedTime: new Date(),
        status: Job.status.READY,
        params: jobParams,
        successListeners: [resolve],
        failureListeners: [reject]
      });

      this.executeNextJobIfPossible();
    });
  }
}

Queue.priority = Job.priority;

module.exports = Queue;
