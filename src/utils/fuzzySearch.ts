/**
 * Fuzzy Search Engine with Indian Ethnic Wear Dictionary & Levenshtein Distance
 */

// Ethnic Wear Dictionary & Phonetic Mappings
const ETHNIC_SYNONYMS: Record<string, string[]> = {
  kurti: ['kurta', 'kurtis', 'kurtees', 'courti', 'curti', 'kurtie', 'kurtas', 'top', 'kurtix'],
  anarkali: ['anarkli', 'anarkaly', 'anarkely', 'anarkali set', 'anarkalee', 'anarkalies'],
  dupatta: ['dupata', 'dupatte', 'chunni', 'chunari', 'dupatta set', 'dupattas', 'dupatto', 'duppatta'],
  georgette: ['gorjet', 'jorjet', 'georget', 'georgete', 'georgat', 'gorjett', 'georgett'],
  cotton: ['koton', 'coton', 'cotten', 'pure cotton', 'katon', 'cottenn'],
  palazzo: ['plazo', 'pelazo', 'plasso', 'palazo', 'palazzos', 'plazos'],
  sharara: ['sarara', 'sharara set', 'gharara', 'garara', 'shararas'],
  lehenga: ['lahanga', 'linga', 'chaniya', 'lehanga', 'lehnga'],
  suit: ['suits', 'salwar', 'suit set', 'soot', 'salwar suit'],
  silk: ['resham', 'silks', 'slik', 'dola silk'],
  rayon: ['reyna', 'rayon cotton', 'reyon', 'reyan'],
  festive: ['festiv', 'tyohar', 'party', 'wedding', 'occasional', 'festivel'],
  coord: ['co-ord', 'coord set', 'co ord', 'cord set', 'cords', 'co-ord set']
};

/**
 * Standard Levenshtein Distance Algorithm
 */
export function levenshteinDistance(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const matrix: number[][] = [];

  for (let i = 0; i <= lenA; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lenB; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // Deletion
        matrix[i][j - 1] + 1,     // Insertion
        matrix[i - 1][j - 1] + cost // Substitution
      );
    }
  }

  return matrix[lenA][lenB];
}

/**
 * Checks if a search query token fuzzy matches a target token
 */

function tokenFuzzyMatch(queryToken: string, targetToken: string): boolean {
  if (!queryToken || !targetToken) return false;
  
  const q = queryToken.toLowerCase().trim();
  const t = targetToken.toLowerCase().trim();

  // 1. The product word contains the query ("kurt" -> "kurta"); one-letter queries must match exactly.
  if (q === t) return true;
  if (q.length >= 4 ? t.includes(q) : q.length >= 2 && t.startsWith(q)) return true;
  // The query contains a meaningful product word ("cottonsuit" -> "cotton").
  if (t.length >= 4 && q.includes(t)) return true;

  // 2. Synonyms ("salwar" finds "suit"), compared on whole words or 3+ letter prefixes only.
  const variantMatches = (v: string, word: string) => v === word || (word.length >= 3 && v.startsWith(word));
  for (const [canonical, synonyms] of Object.entries(ETHNIC_SYNONYMS)) {
    const allVariants = [canonical, ...synonyms];
    if (allVariants.some(v => variantMatches(v, q)) && allVariants.some(v => variantMatches(v, t))) return true;
  }

  // 3. Typo tolerance for longer words only ("georgete" -> "georgette").
  if (q.length < 5 || t.length < 4 || Math.abs(q.length - t.length) > 2) return false;
  return levenshteinDistance(q, t) <= (q.length <= 7 ? 1 : 2);
}

/**
 * Main Fuzzy Matcher for Products
 * Matches against Product Name, Category, Subcategory, Fabric, Color, and Occasion
 */
export function fuzzyMatchProduct(product: any, searchQuery: string): boolean {
  if (!searchQuery || !searchQuery.trim()) return true;

  const rawQuery = searchQuery.toLowerCase().trim();
  const queryTokens = rawQuery.split(/\s+/).filter(Boolean);

  // Combine product text fields into target tokens
  const targetText = [
    product.name || '',
    product.category || '',
    product.subcategory || '',
    product.fabric || '',
    product.occasion || '',
    product.fit || '',
    product.sku || '',
    ...(Array.isArray(product.tags) ? product.tags : []),
    // Admin → product → SEO: extra words shoppers may search for
    typeof product.searchKeywords === 'string' ? product.searchKeywords : '',
    product.description || '',
    ...(Array.isArray(product.colors) ? product.colors.map((c: any) => typeof c === 'string' ? c : c.name || '') : [])
  ].join(' ').toLowerCase();

  // Whole phrase at the start of a word ("floral dup" -> "floral dupatta")
  const escaped = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, (ch) => `\\${ch}`);
  if (new RegExp(`(^|[^a-z0-9])${escaped}`).test(targetText)) return true;

  const targetTokens = targetText.split(/[\s,/\-().]+/).filter((token) => token.length >= 2);

  // Every token in the user's search query must fuzzy-match at least one token in the product
  return queryTokens.every(qToken => {
    return targetTokens.some(tToken => tokenFuzzyMatch(qToken, tToken));
  });
}
