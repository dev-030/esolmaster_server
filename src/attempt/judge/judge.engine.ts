const parseConfig = (config: any) => {
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch {
      return null;
    }
  }

  return config;
};

const normalizeValue = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const extractMatchingPairsFromConfig = (config: any): string[] => {
  if (Array.isArray(config?.pairs)) {
    return config.pairs
      .filter((pair: any) => pair?.left && pair?.right)
      .map(
        (pair: any) =>
          `${normalizeValue(pair.left)}::${normalizeValue(pair.right)}`,
      );
  }

  const leftItems = Array.isArray(config?.leftItems) ? config.leftItems : [];
  const rightItems = Array.isArray(config?.rightItems) ? config.rightItems : [];
  const matches = config?.matches ?? {};

  return leftItems
    .map((left: any, leftIndex: number) => {
      const rightIndex = matches[String(leftIndex)] ?? matches[leftIndex];

      if (typeof rightIndex !== 'number') return null;

      const rightRaw = rightItems[rightIndex];
      const right =
        typeof rightRaw === 'string'
          ? rightRaw
          : typeof rightRaw?.value === 'string'
            ? rightRaw.value
            : '';

      if (!left || !right) return null;

      return `${normalizeValue(left)}::${normalizeValue(right)}`;
    })
    .filter((pair: any) => Boolean(pair));
};

const extractWordBoxAnswersFromConfig = (config: any): string[] => {
  if (Array.isArray(config?.sentences)) {
    return config.sentences.map((sentence: any) => {
      if (typeof sentence === 'string') return '';
      return normalizeValue(sentence?.answer);
    });
  }

  if (Array.isArray(config?.items)) {
    return config.items.map((item: any) => normalizeValue(item?.word));
  }

  return [];
};

export const judgeAnswer = (
  type: string,
  config: any,
  studentData: any,
): boolean => {
  const parsedConfig = parseConfig(config);

  if (!parsedConfig) return false;

  switch (type) {
    case 'MCQ': {
      if (typeof studentData !== 'string') return false;

      const correctOption = parsedConfig.options?.[parsedConfig.correctIndex];

      return (
        studentData.trim().toLowerCase() ===
        String(correctOption).trim().toLowerCase()
      );
    }

    case 'GAP_FILL': {
      if (typeof studentData !== 'string') return false;

      const correctAnswer =
        parsedConfig.answer ??
        parsedConfig.correctAnswer ??
        parsedConfig.options?.[parsedConfig.correctIndex];

      return (
        studentData.trim().toLowerCase() ===
        String(correctAnswer).trim().toLowerCase()
      );
    }

    case 'QUESTION_ANSWER': {
      if (typeof studentData !== 'string') return false;

      if (!parsedConfig.answer) return false;

      return (
        studentData.trim().toLowerCase() ===
        parsedConfig.answer.trim().toLowerCase()
      );
    }

    case 'MATCHING': {
      if (!Array.isArray(studentData)) {
        return false;
      }

      const result = judgeMatchingAnswer(parsedConfig, studentData);

      return result.isCorrect;
    }

    case 'ORDERING': {
      // Student submits the item texts in their chosen order.
      if (!Array.isArray(studentData)) return false;

      const correctItems = Array.isArray(parsedConfig.items)
        ? parsedConfig.items
        : [];
      if (correctItems.length === 0) return false;
      if (studentData.length !== correctItems.length) return false;

      // Correct only if every position matches the stored order exactly.
      return correctItems.every(
        (item: any, index: number) =>
          normalizeValue(studentData[index]) === normalizeValue(item),
      );
    }

    case 'WORD_BOX_MATCH': {
      if (!Array.isArray(studentData)) return false;

      const expectedAnswers = extractWordBoxAnswersFromConfig(parsedConfig);
      if (expectedAnswers.length === 0) return false;

      const matchedCount = expectedAnswers.reduce(
        (count: number, expected: string, index: number) => {
          if (!expected) return count;

          const studentAnswer = normalizeValue(studentData[index]);
          return studentAnswer && studentAnswer === expected
            ? count + 1
            : count;
        },
        0,
      );

      // Internal judging for word-box: count as correct if at least one sentence is correct.
      return matchedCount > 0;
    }

    default:
      return false;
  }
};

const judgeMatchingAnswer = (
  config: any,
  studentData: unknown[],
): {
  isCorrect: boolean;
  matchedCount: number;
  totalPairs: number;
  percentage: number;
} => {
  const correctPairs = extractMatchingIndexPairsFromConfig(config);

  if (correctPairs.length === 0) {
    return {
      isCorrect: false,
      matchedCount: 0,
      totalPairs: 0,
      percentage: 0,
    };
  }

  const correctSet = new Set(correctPairs);

  const studentPairs = studentData
    .map((item) => normalizeMatchingStudentPair(item))
    .filter((item): item is string => Boolean(item));

  const matchedCount = studentPairs.filter((pair) =>
    correctSet.has(pair),
  ).length;

  const totalPairs = correctPairs.length;

  return {
    isCorrect: matchedCount === totalPairs,
    matchedCount,
    totalPairs,
    percentage: Math.round((matchedCount / totalPairs) * 100),
  };
};

const extractMatchingIndexPairsFromConfig = (config: any): string[] => {
  if (config?.matches && typeof config.matches === 'object') {
    return Object.entries(config.matches)
      .filter(([, rightIndex]) => typeof rightIndex === 'number')
      .map(([leftIndex, rightIndex]) => {
        return `${leftIndex}::${rightIndex}`;
      });
  }

  return [];
};

const normalizeMatchingStudentPair = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;

  const [leftRaw, rightRaw] = value.split('::');

  if (!leftRaw || !rightRaw) return null;

  const leftIndex = leftRaw.split('-')[0];
  const rightIndex = rightRaw.split('-')[0];

  if (leftIndex === undefined || rightIndex === undefined) return null;

  return `${leftIndex}::${rightIndex}`;
};
