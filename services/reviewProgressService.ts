import { EventEmitter } from 'events';

class ReviewProgressService extends EventEmitter {
  publish(event: Record<string, unknown>) { this.emit('progress', { at: new Date().toISOString(), ...event }); }
}

const service = new ReviewProgressService();
service.setMaxListeners(100);
export = service;
