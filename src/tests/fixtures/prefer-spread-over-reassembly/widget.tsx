/** A `.tsx` sibling: the extension search has to reach past `.ts`. */
export type WidgetProps = { a: string; b: string; c: string };

export const Widget = ({ a }: WidgetProps) => <span>{a}</span>;
