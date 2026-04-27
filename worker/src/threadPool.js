import { Worker as ThreadWorker } from 'node:worker_threads';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ThreadPool {
  constructor(size = Math.max(2, Math.min(os.cpus().length, 4))) {
    this.workers = Array.from({ length: size }, () => this.createWorker());
    this.nextWorker = 0;
    this.nextTask = 0;
    this.pending = new Map();
  }

  createWorker() {
    const worker = new ThreadWorker(path.join(__dirname, 'workers', 'messageProcessor.thread.js'));

    worker.on('message', (message) => {
      const task = this.pending.get(message.taskId);
      if (!task) return;

      this.pending.delete(message.taskId);
      if (message.ok) {
        task.resolve(message.result);
      } else {
        task.reject(new Error(message.error));
      }
    });

    worker.on('error', (err) => {
      for (const [taskId, task] of this.pending.entries()) {
        if (task.worker === worker) {
          this.pending.delete(taskId);
          task.reject(err);
        }
      }
    });

    return worker;
  }

  run(name, payload) {
    const worker = this.workers[this.nextWorker];
    this.nextWorker = (this.nextWorker + 1) % this.workers.length;
    const taskId = `${Date.now()}:${this.nextTask++}`;

    return new Promise((resolve, reject) => {
      this.pending.set(taskId, { resolve, reject, worker });
      worker.postMessage({ taskId, name, payload });
    });
  }

  async close() {
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }
}
