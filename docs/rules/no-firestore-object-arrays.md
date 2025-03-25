# Disallow arrays of objects in Firestore type definitions to optimize performance and avoid unnecessary fetches (`@blumintinc/blumint/no-firestore-object-arrays`)

⚠️ This rule _warns_ in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule prevents the use of arrays of objects in Firestore type definitions. Arrays of objects in Firestore have several significant limitations:

1. **Not queryable**: You can't efficiently filter, sort, or paginate arrays of objects in Firestore queries
2. **Destructive updates**: Modifying a single item requires rewriting the entire array
3. **Concurrency issues**: Multiple users updating the same array can lead to race conditions and data loss

Instead, this rule encourages using map structures (Record types) with an index field to preserve ordering information.

### ❌ Incorrect

```typescript
// Using arrays of objects directly
export type UserProfile = {
  id: string;
  friends: { id: string; name: string }[];
};

// Using Array<T> syntax with object types
export type Post = {
  comments: Array<{ text: string; author: string }>;
};
```

### ✅ Correct

```typescript
// Using maps/records with string keys
export type UserProfile = {
  id: string;
  friends: Record<string, { id: string; name: string; index: number }>;
};

// Using primitive arrays (these are allowed)
export type MediaItem = {
  id: string;
  tags: string[];
  scores: number[];
};
```

## The Array-Map Conversion System

To help maintain order while using map structures, we recommend implementing an Array-Map Conversion system with utility functions:

1. **toMap**: Converts arrays to maps while adding index information
2. **toArr**: Converts maps back to arrays with automatic sorting by index

### Example Implementation

```typescript
// Identifiable.ts
export interface Identifiable {
  id: string;
}

// Indexed.ts
export interface Indexed {
  index: number;
}

// toMap.ts
export function toMap<T extends Identifiable>(
  array: T[]
): Record<string, T & Indexed> {
  return array.reduce((acc, item, index) => {
    acc[item.id] = { ...item, index };
    return acc;
  }, {} as Record<string, T & Indexed>);
}

// toArr.ts
export function toArr<T extends Indexed>(
  map: Record<string, T>
): T[] {
  return Object.values(map).sort((a, b) => a.index - b.index);
}
```

### Usage Example

```typescript
// Define your types using maps instead of arrays
interface Match extends Identifiable {
  id: string;
  player1: string;
  player2: string;
  score1: number;
  score2: number;
}

interface Tournament {
  id: string;
  name: string;
  matches: Record<string, Match & Indexed>; // Map structure for queryability
}

// When fetching data for display
function displayTournamentMatches(tournament: Tournament) {
  // Convert map back to ordered array for display
  const orderedMatches = toArr(tournament.matches);

  // Now we can render the matches in the correct order
  return orderedMatches.map(match => (
    <MatchComponent key={match.id} match={match} />
  ));
}

// When a user creates new matches
function addMatchesToTournament(tournamentId: string, newMatches: Match[]) {
  // Convert array to map before storing in Firestore
  const matchesMap = toMap(newMatches);

  // Update Firestore with the map structure
  return db.collection('tournaments').doc(tournamentId).update({
    matches: matchesMap
  });
}
```

## When to Use This Pattern

- When you need to maintain a specific order while still having queryable data
- For collections that require individual item updates without rewriting the entire array
- When you need to avoid concurrency issues with multiple users updating the same data

## When Not to Use

- For primitive arrays (strings, numbers) - those can be efficiently stored as arrays in Firestore
