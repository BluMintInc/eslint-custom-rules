# Enforce using useMemo for inline object/array literals passed as props to JSX components to prevent unnecessary re-renders. When object/array literals are defined inline in JSX, they create new references on every render, causing child components to re-render even if the values haven't changed. Wrap them in useMemo to maintain referential equality (`@blumintinc/blumint/require-usememo-object-literals`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->
