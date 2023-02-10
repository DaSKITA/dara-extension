/* eslint-disable  no-param-reassign */

class WorkflowState {
  constructor({ storage, key = 'workflowState' }) {
    this.key = key;
    this.storage = storage;

    this.states = new Map();
    this.eventListeners = {};
  }

  _saveToStorage() {
    const states = Object.fromEntries(this.states);
    return this.storage.set(this.key, states);
  }

  dispatchEvent(name, params) {
    const listeners = this.eventListeners[name];

    if (!listeners) return;

    listeners.forEach((callback) => {
      callback(params);
    });
  }

  on(name, listener) {
    (this.eventListeners[name] = this.eventListeners[name] || []).push(
      listener
    );
  }

  off(name, listener) {
    const listeners = this.eventListeners[name];
    if (!listeners) return;

    const index = listeners.indexOf(listener);
    if (index !== -1) listeners.splice(index, 1);
  }

  get getAll() {
    return this.states;
  }

  async get(stateId) {
    let { states } = this;

    if (typeof stateId === 'function') {
      states = Array.from(states.entries()).find(({ 1: state }) =>
        stateId(state)
      );
    } else if (stateId) {
      states = this.states.get(stateId);
    }

    return states;
  }

  async add(id, data = {}) {
    this.states.set(id, data);
    await this._saveToStorage(this.key);
  }

  async stop(id) {
    const isStateExist = await this.get(id);
    if (!isStateExist) {
      await this.delete(id);
      this.dispatchEvent('stop', id);
      return id;
    }

    await this.update(id, { isDestroyed: true });
    this.dispatchEvent('stop', id);
    return id;
  }

  async update(id, data = {}) {
    const state = this.states.get(id);
    this.states.set(id, { ...state, ...data });
    this.dispatchEvent('update', { id, data });
    await this._saveToStorage();
  }

  async delete(id) {
    this.states.delete(id);
    this.dispatchEvent('delete', id);
    await this._saveToStorage();
  }
}

export default WorkflowState;
