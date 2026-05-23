export interface FuzzySearchResult<T> {
  item: T;
  score: number;
  matches: { field: string; indices: number[] }[];
}

interface SearchableFields<T> {
  [key: string]: (item: T) => string | string[];
}

/**
 * Performs fuzzy search on a list of items
 * Scoring algorithm:
 * - Exact match: 100 points
 * - Starts with query: 80 points
 * - Contains query (case insensitive): 60 points
 * - Sequential character match: 40 points + bonus for consecutive matches
 * - Keyword match: 50 points
 */
export function fuzzySearch<T>(
  items: T[],
  query: string,
  searchableFields: SearchableFields<T>,
  minScore: number = 0
): FuzzySearchResult<T>[] {
  if (!query.trim()) {
    // Return all items with max score if no query
    return items.map(item => ({
      item,
      score: 100,
      matches: [],
    }));
  }

  const normalizedQuery = query.toLowerCase().trim();
  const results: FuzzySearchResult<T>[] = [];

  for (const item of items) {
    let maxScore = 0;
    const matches: { field: string; indices: number[] }[] = [];

    for (const [fieldName, getter] of Object.entries(searchableFields)) {
      const value = getter(item);

      if (Array.isArray(value)) {
        // Handle array fields (e.g., keywords)
        for (const str of value) {
          const { score, indices } = scoreMatch(str, normalizedQuery);
          if (score > maxScore) {
            maxScore = score;
            matches.length = 0; // Clear previous matches
            matches.push({ field: fieldName, indices });
          } else if (score === maxScore && score > 0) {
            matches.push({ field: fieldName, indices });
          }
        }
      } else {
        // Handle string fields
        const { score, indices } = scoreMatch(value, normalizedQuery);
        if (score > maxScore) {
          maxScore = score;
          matches.length = 0; // Clear previous matches
          matches.push({ field: fieldName, indices });
        } else if (score === maxScore && score > 0) {
          matches.push({ field: fieldName, indices });
        }
      }
    }

    if (maxScore >= minScore) {
      results.push({
        item,
        score: maxScore,
        matches,
      });
    }
  }

  // Sort by score (descending)
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Scores a single string match against a query
 */
function scoreMatch(text: string, query: string): { score: number; indices: number[] } {
  const normalizedText = text.toLowerCase();
  const indices: number[] = [];

  // Exact match
  if (normalizedText === query) {
    for (let i = 0; i < text.length; i++) {
      indices.push(i);
    }
    return { score: 100, indices };
  }

  // Starts with query
  if (normalizedText.startsWith(query)) {
    for (let i = 0; i < query.length; i++) {
      indices.push(i);
    }
    return { score: 80, indices };
  }

  // Contains query (contiguous substring)
  const containsIndex = normalizedText.indexOf(query);
  if (containsIndex !== -1) {
    for (let i = 0; i < query.length; i++) {
      indices.push(containsIndex + i);
    }
    return { score: 60, indices };
  }

  // Sequential character match (non-contiguous)
  let textIndex = 0;
  let queryIndex = 0;
  let consecutiveMatches = 0;
  let maxConsecutive = 0;

  while (textIndex < normalizedText.length && queryIndex < query.length) {
    if (normalizedText[textIndex] === query[queryIndex]) {
      indices.push(textIndex);
      queryIndex++;
      consecutiveMatches++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
    } else {
      consecutiveMatches = 0;
    }
    textIndex++;
  }

  // All query characters found
  if (queryIndex === query.length) {
    // Base score for sequential match
    let score = 40;

    // Bonus for consecutive matches
    const consecutiveBonus = Math.min(maxConsecutive * 5, 30);
    score += consecutiveBonus;

    // Bonus for match density (how close together the matches are)
    const span = indices[indices.length - 1] - indices[0] + 1;
    const density = query.length / span;
    const densityBonus = Math.floor(density * 20);
    score += densityBonus;

    return { score, indices };
  }

  // No match
  return { score: 0, indices: [] };
}

/**
 * Highlights matched characters in text
 */
export function highlightMatches(text: string, indices: number[]): string {
  if (indices.length === 0) return text;

  let result = '';
  let lastIndex = 0;

  for (const index of indices) {
    if (index >= text.length) break;

    // Add text before this match
    if (index > lastIndex) {
      result += text.substring(lastIndex, index);
    }

    // Add highlighted character
    result += `<mark>${text[index]}</mark>`;
    lastIndex = index + 1;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    result += text.substring(lastIndex);
  }

  return result;
}
