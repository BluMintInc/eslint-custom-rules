/**
 * Fixture for issue #1316: a default-exported CLASS component. The relaxation
 * only proves zero-parameter *function* components, so a class default export
 * resolves to nothing and the child keeps demanding composition.
 */
import { Component } from 'react';

export type DefaultClassChildProps = Readonly<{
  value: string;
}>;

export default class extends Component<DefaultClassChildProps> {
  public render() {
    return <div>{this.props.value}</div>;
  }
}
