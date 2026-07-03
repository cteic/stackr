/**
 * The reveal ceremony as a pure state machine, so the ordering guarantees are
 * testable without a renderer: the phrase can only be reached through the
 * device-auth gate (or an explicit unprotected-device acknowledgement), and
 * the verified state can only be reached through the quiz.
 */
export type BackupStage =
  | 'intro'
  | 'authenticating'
  | 'unprotected-warning'
  | 'hold'
  | 'revealed'
  | 'quiz'
  | 'verified';

export type BackupEvent =
  | { type: 'begin' }
  | { type: 'auth-passed' }
  | { type: 'auth-failed' }
  | { type: 'auth-unavailable' }
  | { type: 'acknowledge-unprotected' }
  | { type: 'hold-confirmed' }
  | { type: 'start-quiz' }
  | { type: 'quiz-passed' }
  | { type: 'quiz-failed' }
  | { type: 'exit' };

export function backupFlowReducer(stage: BackupStage, event: BackupEvent): BackupStage {
  if (event.type === 'exit') return 'intro';
  switch (stage) {
    case 'intro':
      return event.type === 'begin' ? 'authenticating' : stage;
    case 'authenticating':
      if (event.type === 'auth-passed') return 'hold';
      if (event.type === 'auth-failed') return 'intro';
      if (event.type === 'auth-unavailable') return 'unprotected-warning';
      return stage;
    case 'unprotected-warning':
      return event.type === 'acknowledge-unprotected' ? 'hold' : stage;
    case 'hold':
      return event.type === 'hold-confirmed' ? 'revealed' : stage;
    case 'revealed':
      return event.type === 'start-quiz' ? 'quiz' : stage;
    case 'quiz':
      if (event.type === 'quiz-passed') return 'verified';
      if (event.type === 'quiz-failed') return 'revealed';
      return stage;
    case 'verified':
      return stage;
  }
}

/** The phrase may only be on screen in these stages — drives the capture guard. */
export function isPhraseVisible(stage: BackupStage): boolean {
  return stage === 'revealed' || stage === 'quiz';
}

/**
 * Two distinct word positions for the confirm quiz. `rand` is injected
 * (0 <= rand() < 1) so tests are deterministic; positions are returned
 * ascending for stable copy ("word #3 and word #9").
 */
export function pickQuizIndexes(wordCount: number, rand: () => number): [number, number] {
  if (wordCount < 2) {
    throw new Error('quiz needs at least two words');
  }
  const first = Math.floor(rand() * wordCount);
  let second = Math.floor(rand() * (wordCount - 1));
  if (second >= first) second += 1;
  return first < second ? [first, second] : [second, first];
}

/** Case- and whitespace-insensitive check of the user's two answers. */
export function checkQuizAnswers(
  words: readonly string[],
  indexes: readonly [number, number],
  answers: readonly [string, string],
): boolean {
  return indexes.every((wordIndex, position) => {
    const expected = words[wordIndex];
    const given = answers[position];
    if (expected === undefined || given === undefined) return false;
    return given.trim().toLowerCase() === expected.toLowerCase();
  });
}
