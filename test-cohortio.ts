export class CohortIO {
  // Other class properties and constructor...

  /**
   * Executes the cohort operation
   * @returns Promise that resolves when the operation is complete
   */
  public async execute() {
    const cohorts = await this.fetchCohorts();
    if (cohorts.length === 0) {
      return;
    }

    const updates = this.buildUpdates(cohorts);
    if (updates.length === 0) {
      return;
    }

    await this.applyUpdates(updates);
  }

  /**
   * Fetches cohorts from Firestore based on the query
   * @returns Array of cohorts
   * @private
   */
  private async fetchCohorts() {
    const fetcher = new FirestoreFetcher<Cohort>(this.query, {
      transaction: this.transaction,
    });
    return await fetcher.fetch();
  }

  /**
   * Applies updates to Firestore using DocSetterTransaction
   * @param updates Cohort updates to apply
   * @private
   */
  private async applyUpdates(updates: Partial<Cohort>[]) {
    const docSetter = new DocSetterTransaction<Cohort>(this.query.firestore, {
      transaction: this.transaction,
    });
    docSetter.setAll(updates);
  }
}
