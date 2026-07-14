const parseConfig = (config: any) => {
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }

  return config ?? {};
};

const norm = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .toLowerCase();

const rightText = (rightRaw: any): string =>
  typeof rightRaw === 'string'
    ? rightRaw
    : typeof rightRaw?.value === 'string'
      ? rightRaw.value
      : '';

const getMatchingPairs = (
  config: any,
): Array<{ left: string; right: string }> => {
  if (Array.isArray(config?.pairs)) {
    return config.pairs
      .filter((pair: any) => pair?.left && pair?.right)
      .map((pair: any) => ({ left: pair.left, right: pair.right }));
  }

  const leftItems = Array.isArray(config?.leftItems) ? config.leftItems : [];
  const rightItems = Array.isArray(config?.rightItems) ? config.rightItems : [];
  const matches = config?.matches ?? {};

  return leftItems
    .map((left: string, leftIndex: number) => {
      const rightIndex = matches[String(leftIndex)] ?? matches[leftIndex];
      if (typeof rightIndex !== 'number') return null;

      const right = rightText(rightItems[rightIndex]);
      if (!left || !right) return null;

      return { left, right };
    })
    .filter((pair: any): pair is { left: string; right: string } =>
      Boolean(pair),
    );
};

/**
 * Turn the student's raw matching answer (array of "leftIdx-..::rightIdx-.."
 * index strings) into human-readable {left, right, correct} pairs.
 */
const buildUserMatchingPairs = (
  config: any,
  studentData: any,
): Array<{ left: string; right: string; correct: boolean }> => {
  if (!Array.isArray(studentData)) return [];

  const leftItems = Array.isArray(config?.leftItems) ? config.leftItems : [];
  const rightItems = Array.isArray(config?.rightItems) ? config.rightItems : [];
  const matches = config?.matches ?? {};

  return studentData
    .map((item: unknown) => {
      if (typeof item !== 'string') return null;
      const [leftRaw, rightRaw] = item.split('::');
      if (!leftRaw || !rightRaw) return null;

      const leftIdx = Number(leftRaw.split('-')[0]);
      const rightIdx = Number(rightRaw.split('-')[0]);
      if (Number.isNaN(leftIdx) || Number.isNaN(rightIdx)) return null;

      const left = leftItems[leftIdx] ?? `Item ${leftIdx + 1}`;
      const right = rightText(rightItems[rightIdx]) || `Option ${rightIdx + 1}`;

      const expected = matches[String(leftIdx)] ?? matches[leftIdx];
      const correct = expected === rightIdx;

      return { left, right, correct };
    })
    .filter(
      (p: any): p is { left: string; right: string; correct: boolean } =>
        Boolean(p),
    );
};

export const resultBuilders = {
  MCQ: (question: any, answer: any) => {
    const config = parseConfig(question.config);
    const options: string[] = Array.isArray(config.options)
      ? config.options
      : [];
    const correctIndex =
      typeof config.correctIndex === 'number' ? config.correctIndex : -1;
    const correctOption = options[correctIndex] ?? 'N/A';
    const userIndex = options.findIndex((o) => norm(o) === norm(answer.answerData));

    return {
      question: config.question,
      variant: 'choice',
      options,
      correctIndex,
      userIndex,
      userAnswer: answer.answerData,
      correctAnswers: [correctOption],
      note: config.explanation ?? null,
    };
  },

  GAP_FILL: (question: any, answer: any) => {
    const config = parseConfig(question.config);
    const options: string[] = Array.isArray(config.options)
      ? config.options
      : [];
    const hasOptions = options.length > 0;
    const correctIndex =
      typeof config.correctIndex === 'number' ? config.correctIndex : -1;
    const correctText =
      config.answer ?? config.correctAnswer ?? options[correctIndex] ?? 'N/A';
    const userIndex = hasOptions
      ? options.findIndex((o) => norm(o) === norm(answer.answerData))
      : -1;

    return {
      question: config.question,
      variant: hasOptions ? 'choice' : 'text',
      options,
      correctIndex,
      userIndex,
      userAnswer: answer.answerData,
      correctAnswers: [correctText],
      note: config.explanation ?? null,
    };
  },

  MATCHING: (question: any, answer: any) => {
    const config = parseConfig(question.config);
    const correctPairs = getMatchingPairs(config);
    const userPairs = buildUserMatchingPairs(config, answer.answerData);

    return {
      question: config.question || 'Match the following items',
      variant: 'matching',
      userPairs,
      correctPairs,
      // Back-compat string forms
      userAnswer: userPairs.map((p) => `${p.left} :: ${p.right}`),
      correctAnswers: correctPairs.map((p) => `${p.left} :: ${p.right}`),
      note: null,
    };
  },

  WORD_BOX_MATCH: (question: any, answer: any) => {
    const config = parseConfig(question.config);
    const studentData = Array.isArray(answer.answerData)
      ? answer.answerData
      : [answer.answerData];

    const sentences = Array.isArray(config.sentences)
      ? config.sentences
          .map((sentence: any, index: number) => {
            if (typeof sentence === 'string' || !sentence?.text) return null;
            const correctAnswer = sentence.answer ?? '';
            const userAnswer = studentData[index] ?? '';
            return {
              index,
              text: sentence.text,
              correctAnswer,
              userAnswer,
              correct: !!correctAnswer && norm(userAnswer) === norm(correctAnswer),
            };
          })
          .filter((s: any) => Boolean(s))
      : [];

    return {
      question: config.question || 'Match words from the box to the sentences',
      variant: 'word-box',
      words: Array.isArray(config.words) ? config.words : [],
      sentences,
      userAnswer: studentData,
      correctAnswers: sentences.map(
        (s: any) => `${s.index + 1}. ${s.text} => ${s.correctAnswer}`,
      ),
      note: config.explanation ?? null,
    };
  },

  ORDERING: (question: any, answer: any) => {
    const config = parseConfig(question.config);
    const correctItems: string[] = Array.isArray(config.items)
      ? config.items
      : [];
    const userItems: string[] = Array.isArray(answer.answerData)
      ? answer.answerData
      : [];

    const steps = correctItems.map((item, index) => ({
      position: index + 1,
      userItem: userItems[index] ?? '',
      correctItem: item,
      correct: norm(userItems[index]) === norm(item),
    }));

    return {
      question: config.question || 'Put the items in the correct order',
      variant: 'ordering',
      steps,
      userItems,
      correctItems,
      userAnswer: userItems,
      correctAnswers: correctItems,
      note: config.explanation ?? null,
    };
  },

  QUESTION_ANSWER: (question: any, answer: any) => {
    const config = parseConfig(question.config);
    const acceptedAnswers = Array.isArray(config.acceptedAnswers)
      ? config.acceptedAnswers
      : [config.answer ?? config.correctAnswer].filter(Boolean);

    return {
      question: config.question,
      variant: 'text',
      userAnswer: answer.answerData,
      acceptedAnswers,
      correctAnswers: acceptedAnswers,
      note: config.explanation ?? null,
    };
  },
};
