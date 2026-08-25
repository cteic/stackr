import { describe, expect, it } from 'vitest';
import { createSignRequestQueue, createStubTransport, type SignRequest } from './sign-requests';

function request(overrides: Partial<SignRequest>): SignRequest {
  return {
    id: 'req-1',
    chain: 'eth',
    origin: 'Paired device · abcd1234',
    originVerified: false,
    kind: 'message',
    display: 'Sign in to Stackr',
    payload: { message: 'hello' },
    receivedAt: '2026-07-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('createSignRequestQueue', () => {
  it('enqueues requests delivered by the transport', () => {
    const transport = createStubTransport();
    const queue = createSignRequestQueue(transport);

    queue.getState().enqueue(request({}));

    expect(queue.getState().queue).toHaveLength(1);
  });

  it('ignores duplicate delivery of the same request id', () => {
    const queue = createSignRequestQueue(createStubTransport());

    queue.getState().enqueue(request({}));
    queue.getState().enqueue(request({ display: 'retry of the same request' }));

    expect(queue.getState().queue).toHaveLength(1);
  });

  it('sends the decision through the transport and drops the request', async () => {
    const transport = createStubTransport();
    const queue = createSignRequestQueue(transport);
    queue.getState().enqueue(request({}));

    await queue.getState().resolve({ id: 'req-1', approved: false });

    expect(transport.decisions).toEqual([{ id: 'req-1', approved: false }]);
    expect(queue.getState().queue).toEqual([]);
  });

  it('ignores a decision for an unknown request (no phantom responses)', async () => {
    const transport = createStubTransport();
    const queue = createSignRequestQueue(transport);

    await queue.getState().resolve({ id: 'ghost', approved: true });

    expect(transport.decisions).toEqual([]);
  });

  it('keeps later requests queued while the head is resolved', async () => {
    const transport = createStubTransport();
    const queue = createSignRequestQueue(transport);
    queue.getState().enqueue(request({}));
    queue.getState().enqueue(request({ id: 'req-2', display: 'Second request' }));

    await queue.getState().resolve({ id: 'req-1', approved: true });

    expect(queue.getState().queue.map(entry => entry.id)).toEqual(['req-2']);
  });
});
