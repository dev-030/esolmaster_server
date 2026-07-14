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

const toMatchingPairs = (config: any) => {
  if (Array.isArray(config?.pairs)) {
    return config.pairs
      .filter((pair: any) => pair?.left && pair?.right)
      .map((pair: any, index: number) => ({
        id: pair.id ?? String(index),
        left: pair.left,
        right: pair.right,
      }));
  }

  const leftItems = Array.isArray(config?.leftItems) ? config.leftItems : [];
  const rightItems = Array.isArray(config?.rightItems) ? config.rightItems : [];
  const matches = config?.matches ?? {};

  return leftItems
    .map((left: string, leftIndex: number) => {
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

      return {
        id: `${leftIndex}-${rightIndex}`,
        left,
        right,
      };
    })
    .filter((pair: any) => Boolean(pair));
};

export const sanitizeQuestion = (question: any) => {
  const config = parseConfig(question.config);

  switch (question.type) {
    case 'MCQ':
      return {
        ...question,
        config: {
          question: config.question,
          options: config.options,
        },
      };

    case 'GAP_FILL':
      return {
        ...question,
        config: {
          question: config.question,
          options: config.options,
        },
      };

    case 'MATCHING':
      return {
        ...question,
        config: {
          question: config.question,
          pairs: toMatchingPairs(config),
        },
      };

    case 'WORD_BOX_MATCH':
      return {
        ...question,
        config: {
          question: config.question,
          words: Array.isArray(config.words) ? config.words : [],
          sentences: Array.isArray(config.sentences)
            ? config.sentences
                .map((sentence: any, index: number) => {
                  if (typeof sentence === 'string') {
                    return { id: String(index), text: sentence };
                  }

                  if (!sentence?.text) return null;

                  return {
                    id: sentence.id ?? String(index),
                    text: sentence.text,
                  };
                })
                .filter((sentence: any) => Boolean(sentence))
            : [],
        },
      };

    case 'ORDERING': {
      const items = Array.isArray(config.items) ? config.items : [];
      // Shuffle a copy so the stored (correct) order is never revealed. Ids are
      // positional in the shuffled list and carry no ordering information.
      const shuffled = [...items]
        .map((text: any) => ({ text, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map((entry, index) => ({ id: String(index), text: entry.text }));

      return {
        ...question,
        config: {
          question: config.question,
          items: shuffled,
        },
      };
    }

    case 'QUESTION_ANSWER':
      return {
        ...question,
        config: {
          question: config.question,
        },
      };

    default:
      return {
        ...question,
        config,
      };
  }
};
