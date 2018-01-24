# throttle-queue

A promise based priority queue with task deduplication, concurrency control, serial resolution and aging.

## Installation

```bash
  npm install throttle-queue
  # or
  yarn add throttle-queue
```

## Features

- Async jobs with promise support
- Job Deduplication
- Priority Assignment
- Concurrency control
- ging of jobs to prevent starvation

All while keeping your code execution serial :)

## Usage

```js
const Queue = require("throttle-queue");
const taskQueue = new Queue({ concurrency: 2 });

taskQueue.setExecutor(async ({ pokemon }) => {
  const url = `https://pokeapi.co/api/v2/pokemon/${pokemon}`;
  const response = await fetch(url);
  return await response.json();
});

const result = await taskQueue.process({ pokemon: 'mew' }, 'mew')
console.log('I found', result)
```

## API

### Creating a queue

```js
const queue = new Queue(options);
```

#### options

| option      | type             | default value | description                                                                                           |
| ----------- | ---------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| concurrency | number           | 1             | Maximum number of jobs that can be run concurrently at the same time                                  |
| aging       | boolean          | true          | Whether to age older jobs in order to prevent starvation                                              |
| maxAge      | number (seconds) | `Infinity`    | Time in seconds after which the job will expire and removed from the queue if not executed till then. |

### Setting a task executor (required)

```js
const queue = new Queue(options);

queue.setExecutor(params => {
  console.log('received params', params);
  return "done";
});
```

The task executor picks up the highest priority task from the queue and executes it. It can be synchrounous or asynchronous. When sync, it is internally wrapped in a promise.

### Adding a task to the queue

```js
const queue = new Queue(options)
queue.setExecutor((params) => {
  console.log('received params', params)
  return 'done'
})

const result = await queue.process(params, id, options)
```

#### arguments

* `params` - Object - An data object to pass to the task executor
* `id` - The id of the task. This is used for deduplication.
* `options` - See below

| option   | type             | default value            | description                                                                             |
| -------- | ---------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| priority | number           | 'Queue.priority.LOW' (5) | Priority of the job.                                                                    |
| maxAge   | number (seconds) | `Infinity`               | Time in seconds after which the job will expire. If not set, the global maxAge is used. |

### Clearing the queue

```js
const queue = new Queue()
queue.clear()
````

Clears the queues of all waiting jobs. Jobs in execution are not disturbed.

## Todo

* Optimize perf for cases when there huge number of jobs in the ready queue.
