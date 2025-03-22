import { Memoize } from "typescript-memoize";
class Example {
  @Memoize()
  renderHeader() {
    return <h1>Header</h1>;
  }
}
