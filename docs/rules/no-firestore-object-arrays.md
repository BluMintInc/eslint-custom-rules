# Disallow arrays of objects in Firestore type definitions. Arrays of objects are not queryable in Firestore, require destructive updates (rewriting entire arrays), and cause concurrency issues with race conditions. Instead, use Record<string, T & { index: number }> map structures where the object id becomes the key and an index field preserves ordering. This enables efficient querying, individual item updates, safe concurrent access, and seamless conversion between arrays and maps using toMap()/toArr() utilities (`@blumintinc/blumint/no-firestore-object-arrays`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule prevents the use of arrays of objects in Firestore type definitions. Arrays of objects in Firestore have several significant limitations:

1. **Not queryable**: You can't efficiently filter, sort, or paginate arrays of objects in Firestore queries
2. **Destructive updates**: Modifying a single item requires rewriting the entire array, which is inefficient and error-prone
3. **Concurrency issues**: Multiple users updating the same array can lead to race conditions and data loss
4. **Performance problems**: Large arrays cause unnecessary data transfer and processing overhead

Instead, this rule enforces using map structures (Record types) with an index field to preserve ordering information. This pattern is part of the **Array-Map Conversion System** that provides:

- **Efficient querying**: Individual items can be queried, filtered, and updated
- **Safe concurrent access**: Multiple users can update different items without conflicts
- **Preserved ordering**: Index fields maintain the original array order
- **Seamless conversion**: Utility functions enable easy conversion between arrays and maps
- **Individual item updates**: Modify single items without affecting the entire collection

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
// Using maps/records with index fields for ordering
export type UserProfile = {
  id: string;
  friends: Record<string, { id: string; name: string; index: number }>;
};

// Using primitive arrays (these are allowed)
export type MediaItem = {
  id: string;
  tags: string[];
  scores: number[];
  timestamps: Date[];
};

// Real-world example: Tournament matches
export type Tournament = {
  id: string;
  name: string;
  // Instead of: matches: Match[]
  matches: Record<string, Match & { index: number }>;
};

interface Match {
  id: string;
  player1: string;
  player2: string;
  score1: number;
  score2: number;
}
```

## The Array-Map Conversion System

The Array-Map Conversion system provides a seamless way to convert between arrays and map objects while preserving order. It solves a fundamental challenge in Firestore data modeling: arrays of objects aren't queryable, but you still need to maintain order when displaying that data to users.

### Why Use This System?

In Firestore, storing arrays of objects is problematic because:

1. **Arrays aren't queryable** - You can't efficiently filter, sort, or paginate arrays of objects in Firestore queries
2. **Updates are destructive** - Modifying a single item requires rewriting the entire array
3. **Concurrency issues** - Multiple users updating the same array can lead to race conditions and data loss

The solution is to store data as maps (Record types) where an identifier (usually the `id` field) becomes the key. However, this approach loses the original ordering information that arrays naturally provide. Our Array-Map Conversion system solves this problem by automatically adding an `index` field to each object in the map during conversion.

### Core Utility Functions

1. **toMap**: Converts arrays to maps while adding index information for objects that extend `Identifiable`
2. **toArr**: Converts maps back to arrays with automatic sorting by index for objects that extend `Indexed`

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

### Basic Usage: Converting Between Arrays and Maps

```typescript
// An array of objects with IDs
const usersArray = [
  { id: 'user1', name: 'Alice', email: 'alice@example.com' },
  { id: 'user2', name: 'Bob', email: 'bob@example.com' },
  { id: 'user3', name: 'Charlie', email: 'charlie@example.com' }
];

// Convert to a map - each object gets an index property automatically
const usersMap = toMap(usersArray);

// Result:
// {
//   'user1': { id: 'user1', name: 'Alice', email: 'alice@example.com', index: 0 },
//   'user2': { id: 'user2', name: 'Bob', email: 'bob@example.com', index: 1 },
//   'user3': { id: 'user3', name: 'Charlie', email: 'charlie@example.com', index: 2 }
// }

// Converting the map back to an array (sorted by index)
const usersArrayAgain = toArr(usersMap);
```

### Real-World Application: Tournament Matches

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

// Updating a single match (efficient!)
function updateMatch(tournamentId: string, matchId: string, updates: Partial<Match>) {
  return db.collection('tournaments').doc(tournamentId).update({
    [`matches.${matchId}`]: { ...updates }
  });
}
```

## When to Use This Pattern

- **Ordered collections**: When you need to maintain a specific order while still having queryable data
- **Individual updates**: For collections that require individual item updates without rewriting the entire array
- **Concurrent access**: When you need to avoid concurrency issues with multiple users updating the same data
- **Large collections**: When dealing with collections that may grow large and need efficient querying
- **Complex objects**: When storing objects with multiple properties that need to be searchable

## When Not to Use

- **Primitive arrays**: For arrays of primitives (strings, numbers, booleans) - those can be efficiently stored as arrays in Firestore
- **Small, static collections**: For small collections that rarely change and don't need individual item updates
- **Simple lists**: For simple ordered lists where querying individual items isn't needed

## Best Practices

1. **Always include index fields**: Ensure your map values extend `{ index: number }` to preserve ordering
2. **Use meaningful keys**: Use the object's `id` field as the map key for consistency
3. **Implement utility functions**: Create `toMap()` and `toArr()` utilities for seamless conversion
4. **Consider performance**: For very large collections, consider pagination and lazy loading
5. **Validate data integrity**: Ensure index values are sequential and unique when converting from arrays
