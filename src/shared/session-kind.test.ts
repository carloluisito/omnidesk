import { describe, it, expect } from 'vitest';
import type { SessionKind, SessionCreateRequest, SessionMetadata } from './ipc-types';

describe('SessionKind', () => {
  it('accepts shell and agent create requests', () => {
    const shell: SessionCreateRequest = {
      workingDirectory: '/tmp', permissionMode: 'standard', kind: 'shell',
    };
    const agent: SessionCreateRequest = {
      workingDirectory: '/tmp', permissionMode: 'standard',
    };
    expect(shell.kind).toBe('shell');
    expect(agent.kind).toBeUndefined(); // absent => agent
  });

  it('treats a missing metadata kind as agent (back-compat helper)', () => {
    const meta = { kind: undefined } as Pick<SessionMetadata, 'kind'>;
    const effective: SessionKind = meta.kind ?? 'agent';
    expect(effective).toBe('agent');
  });
});
