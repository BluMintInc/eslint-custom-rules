export class DocumentPropagationManager<TData extends DocumentData, TOmitKey extends keyof TData> {
  // ... other code ...

  private get propogatorFactories() {
    return this.settings.propogatorFactories;
  }
}
