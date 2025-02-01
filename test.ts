export class DocContextFactory<TDoc extends DocumentData> {
  constructor(private readonly displayName: string) {
    this.Context.displayName = displayName;
  }
}
