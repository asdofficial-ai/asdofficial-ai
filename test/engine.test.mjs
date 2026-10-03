import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.ts';
import { Engine } from '../server/engine.ts';
import { readConfig } from '../server/config.ts';
import { calculate } from '../server/tools.ts';
import { ProviderError } from '../server/providers.ts';

test('failed research still produces a reply with an explicit unavailable context', async () => {
  const store = new Store(':memory:'); const session = store.session(); const engine = new Engine(store, readConfig({})), events = [];
  const provider = async function* (_config, messages) { assert.ok(messages.some(message => message.content.includes('live web search failed'))); yield 'I could not verify live facts, but I can help.'; };
  const failedSearch = async () => { throw new ProviderError('provider_rate_limited'); };
  await engine.turn(session.id, 'research-failed', 'Hi', event => events.push(event), undefined, provider, 30000, true, failedSearch);
  assert.ok(events.some(event => event.type === 'tool.failed')); assert.ok(events.some(event => event.type === 'response.completed')); assert.equal(store.history(session.id).length, 2); store.db.close();
});

test('cancelled research does not fall through to another provider call', async () => {
  const store = new Store(':memory:'); const session = store.session(); const engine = new Engine(store, readConfig({})), events = []; let calls = 0;
  const provider = async function* () { calls++; yield 'must not happen'; };
  const cancelledSearch = async () => { engine.cancel(session.id); throw new Error('cancelled'); };
  await engine.turn(session.id, 'research-cancelled', 'Hi', event => events.push(event), undefined, provider, 30000, true, cancelledSearch);
  assert.equal(calls, 0); assert.ok(events.some(event => event.type === 'turn.cancelled')); store.db.close();
});

test('empty model output is an explicit failure rather than a blank successful reply', async () => {
  const store = new Store(':memory:'); const session = store.session(); const engine = new Engine(store, readConfig({})), events = [];
  await engine.turn(session.id, 'empty', 'Hi', event => events.push(event), undefined, async function* () {});
  assert.ok(events.some(event => event.code === 'empty_provider_response')); assert.ok(!events.some(event => event.type === 'response.completed')); assert.equal(store.history(session.id).length, 1); store.db.close();
});

test('conversation ordering, persistence and duplicate suppression', async () => {
  const store = new Store(':memory:'); const session = store.session(); const engine = new Engine(store, readConfig({}));
  const events = [];
  const provider = async function* () { yield 'Hello'; yield ' Kane'; };
  await engine.turn(session.id, 'first', 'Hi', event => events.push(event), undefined, provider);
  assert.deepEqual(events.map(event => event.type), ['assistant.state','response.delta','response.delta','response.completed','assistant.state']);
  assert.deepEqual(events.map(event => event.sequence), [1,2,3,4,5]);
  assert.equal(store.history(session.id)[1].content, 'Hello Kane');
  await assert.rejects(engine.turn(session.id, 'first', 'Hi', () => {}, undefined, provider), /duplicate_request/);
  assert.equal(store.history(session.id).length, 2); store.db.close();
});
test('cancellation suppresses late output and recovers to idle', async () => {
  const store = new Store(':memory:'); const session = store.session(); const engine = new Engine(store, readConfig({})); const events = [];
  const provider = async function* () { engine.cancel(session.id); yield 'stale'; };
  await engine.turn(session.id, 'cancel', 'Hi', event => events.push(event), undefined, provider);
  assert.ok(!events.some(event => event.type === 'response.delta'));
  assert.ok(events.some(event => event.type === 'turn.cancelled'));
  assert.equal(events.at(-1).state, 'idle'); assert.equal(engine.active.size, 0); store.db.close();
});
test('timeout and provider failures recover without assistant persistence', async () => {
  const store = new Store(':memory:'); const session = store.session(); const engine = new Engine(store, readConfig({})); const events = [];
  const provider = async function* (_config, _messages, signal) { await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); signal.throwIfAborted(); yield 'never'; };
  await engine.turn(session.id, 'timeout', 'Hi', event => events.push(event), undefined, provider, 5);
  assert.ok(events.some(event => event.code === 'turn_timeout')); assert.equal(engine.active.size, 0); assert.equal(store.history(session.id).length, 1); store.db.close();
});
test('memory CRUD, retrieval, disablement and sensitive content rejection', () => {
  const store = new Store(':memory:'); const item = store.save('memories', 'Prefers short coding explanations', 'confirmed');
  assert.equal(store.relevantMemory('coding')[0], item.content);
  store.save('memories', 'Prefers detailed coding explanations', 'confirmed', item.id);
  assert.match(store.list('memories')[0].content, /detailed/);
  assert.throws(() => store.save('memories', 'password: secret', 'confirmed'), /sensitive_memory_rejected/);
  store.setMemory(false); assert.deepEqual(store.relevantMemory('coding'), []);
  store.deleteItem('memories', item.id); assert.equal(store.list('memories').length, 0); store.db.close();
});
test('calculator parses arithmetic and rejects code', () => {
  assert.equal(calculate('(2+3)*4-1'), 19);
  for (const value of ['process.exit()', '1/0', '2 3', '(1+2']) assert.throws(() => calculate(value), /invalid_expression/);
});
