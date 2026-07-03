import { describe, expect, it } from 'vitest';
import {
  backupFlowReducer,
  checkQuizAnswers,
  isPhraseVisible,
  pickQuizIndexes,
  type BackupEvent,
  type BackupStage,
} from './backup-flow';

function run(events: BackupEvent[], from: BackupStage = 'intro'): BackupStage {
  return events.reduce(backupFlowReducer, from);
}

describe('backupFlowReducer', () => {
  it('walks the happy path: intro → auth → hold → revealed → quiz → verified', () => {
    expect(
      run([
        { type: 'begin' },
        { type: 'auth-passed' },
        { type: 'hold-confirmed' },
        { type: 'start-quiz' },
        { type: 'quiz-passed' },
      ]),
    ).toBe('verified');
  });

  it('cannot reach the phrase without passing the gate', () => {
    // Straight to reveal without auth: every shortcut event is ignored.
    expect(run([{ type: 'hold-confirmed' }])).toBe('intro');
    expect(run([{ type: 'begin' }, { type: 'hold-confirmed' }])).toBe('authenticating');
    expect(run([{ type: 'begin' }, { type: 'quiz-passed' }])).toBe('authenticating');
  });

  it('failed auth returns to intro; unavailable auth requires acknowledgement', () => {
    expect(run([{ type: 'begin' }, { type: 'auth-failed' }])).toBe('intro');
    const warned = run([{ type: 'begin' }, { type: 'auth-unavailable' }]);
    expect(warned).toBe('unprotected-warning');
    expect(backupFlowReducer(warned, { type: 'acknowledge-unprotected' })).toBe('hold');
  });

  it('a failed quiz returns to the words, not to verified', () => {
    const quiz = run([
      { type: 'begin' },
      { type: 'auth-passed' },
      { type: 'hold-confirmed' },
      { type: 'start-quiz' },
    ]);
    expect(quiz).toBe('quiz');
    expect(backupFlowReducer(quiz, { type: 'quiz-failed' })).toBe('revealed');
  });

  it('exit abandons the ceremony from any stage', () => {
    for (const stage of [
      'authenticating',
      'unprotected-warning',
      'hold',
      'revealed',
      'quiz',
      'verified',
    ] satisfies BackupStage[]) {
      expect(backupFlowReducer(stage, { type: 'exit' })).toBe('intro');
    }
  });

  it('exposes phrase visibility only in revealed and quiz', () => {
    const visible: BackupStage[] = ['revealed', 'quiz'];
    const hidden: BackupStage[] = [
      'intro',
      'authenticating',
      'unprotected-warning',
      'hold',
      'verified',
    ];
    for (const stage of visible) expect(isPhraseVisible(stage)).toBe(true);
    for (const stage of hidden) expect(isPhraseVisible(stage)).toBe(false);
  });
});

describe('pickQuizIndexes', () => {
  it('returns two distinct ascending positions', () => {
    for (let i = 0; i < 50; i += 1) {
      const [a, b] = pickQuizIndexes(12, Math.random);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(12);
      expect(a).toBeLessThan(b);
    }
  });

  it('is deterministic under an injected rand', () => {
    expect(pickQuizIndexes(12, () => 0.999)).toEqual([10, 11]);
    expect(pickQuizIndexes(12, () => 0)).toEqual([0, 1]);
  });
});

describe('checkQuizAnswers', () => {
  const words =
    'abandon ability able about above absent absorb abstract absurd abuse access accident'.split(
      ' ',
    );

  it('accepts correct answers ignoring case and whitespace', () => {
    expect(checkQuizAnswers(words, [2, 8], ['  Able ', 'ABSURD'])).toBe(true);
  });

  it('rejects a wrong word and reversed positions', () => {
    expect(checkQuizAnswers(words, [2, 8], ['able', 'abuse'])).toBe(false);
    expect(checkQuizAnswers(words, [2, 8], ['absurd', 'able'])).toBe(false);
  });
});
