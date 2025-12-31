// Placeholder helper so lint autofixes point to a concrete module.
// Consuming projects should replace this stub with the real Firestore test harness.
export type MockFirestoreInstance = {
  db?: unknown;
  firestore?: unknown;
};

export const mockFirestore = (): MockFirestoreInstance => ({
  db: undefined,
  firestore: undefined,
});
