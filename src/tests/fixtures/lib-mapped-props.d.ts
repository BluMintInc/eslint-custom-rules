/**
 * Stands in for a third-party library's NON-HOMOMORPHIC mapped type — the shape
 * MUI's `SystemProps<Theme>` (`{ [K in SystemKeys]?: … }`) uses to spread its
 * ~100 style shorthands onto `Box`, `Typography`, `Stack` and friends. TS only
 * propagates `declarations` through HOMOMORPHIC mapped types (`Readonly<T>`,
 * `Pick<T, K>`), so every member here is a synthesized symbol with zero
 * declarations, which is precisely the condition under test: a missing
 * declaration is not evidence that the component's author wrote the prop.
 *
 * Deliberately a SCRIPT: no top-level `import`/`export`, so `declare module`
 * declares an ambient module rather than augmenting one, and the declaration is
 * visible to every file in the program.
 */
declare module 'fake-system-lib' {
  export type SystemKeys = 'border' | 'borderTop' | 'bgcolor' | 'display';
  export type ResponsiveStyleValue<T> =
    | T
    | Array<T | null>
    | { [key: string]: T | null };
  export type SystemProps = {
    [K in SystemKeys]?: ResponsiveStyleValue<string | number>;
  };
  export interface LibTypographyProps extends SystemProps {
    variant?: string;
    classes?: Record<string, string>;
  }
}
