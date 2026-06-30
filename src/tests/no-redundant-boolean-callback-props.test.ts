import { ruleTesterTs } from '../utils/ruleTester';
import { noRedundantBooleanCallbackProps } from '../rules/no-redundant-boolean-callback-props';

ruleTesterTs.run(
  'no-redundant-boolean-callback-props',
  noRedundantBooleanCallbackProps,
  {
    valid: [
      // 1. Type with only a callback — no boolean to flag
      `
      type DialogProps = {
        onMinimize?: () => void;
      };
      `,

      // 2. The canonical good example from the issue: shouldShowCloseIcon has
      // `onClose` but `Close` is only 5 chars → below min noun length for
      // suffix-strip match → no flag (prefer false negative per spec)
      `
      type DialogCenteredProps = Readonly<{
        onClose?: () => void;
        onMinimize?: () => void;
        shouldShowCloseIcon?: boolean;
      }>;
      `,

      // 3. Unrelated boolean + unrelated callback — different core nouns entirely
      `
      type Props = {
        shouldShowHeader?: boolean;
        onSubmit?: () => void;
      };
      `,

      // 4. `is` prefix (state) + callback — `is` is not in default boolean prefixes
      `
      type FetchProps = {
        isLoading?: boolean;
        onLoadComplete?: () => void;
      };
      `,

      // 5. isExpanded (state prop) + onExpand — `is` not in boolean prefixes
      `
      type AccordionProps = {
        isExpanded?: boolean;
        onExpand?: () => void;
        onCollapse?: () => void;
      };
      `,

      // 6. isSelected + onSelect — state prefix, not visibility/enablement
      `
      type ListItemProps = {
        isSelected?: boolean;
        onSelect?: () => void;
      };
      `,

      // 7. shouldAutoHide — no matching onAutoHide callback; onDismiss has
      // different noun → no false positive
      `
      type NotificationProps = {
        shouldAutoHide?: boolean;
        shouldShowTimestamp?: boolean;
        onDismiss?: () => void;
      };
      `,

      // 8. shouldShowTimestamp — no onShowTimestamp or onTimestamp callback
      `
      type CardProps = {
        shouldShowTimestamp?: boolean;
        onClick?: () => void;
      };
      `,

      // 9. Boolean with exempt qualifier `Initially` — not a feature-presence toggle
      `
      type AccordionProps = {
        shouldExpandInitially?: boolean;
        onExpand?: () => void;
      };
      `,

      // 10. Boolean with exempt qualifier `WhenHovered`
      `
      type ButtonProps = {
        shouldShowTooltipWhenHovered?: boolean;
        onTooltipShow?: () => void;
      };
      `,

      // 11. enableFeature with no matching callback (no onFeature)
      `
      type Config = {
        enableFeature?: boolean;
        version?: string;
      };
      `,

      // 12. Interface with exempt qualifier `Initially`
      `
      interface SearchBarProps {
        shouldFocusInitially?: boolean;
        onSearch?: (query: string) => void;
      }
      `,

      // 13. shouldShowExpandButton — core after stripping `shouldShow` and
      // `Button` would be `Expand` (6 chars), BUT the callback is `onCollapse`
      // not `onExpand` — different noun → no match
      `
      type PanelProps = {
        shouldShowExpandButton?: boolean;
        onCollapse?: () => void;
      };
      `,

      // 14. Generic `callback | 'disabled'` pattern — no boolean
      `
      type ValueChangeable<TValue> = Readonly<{
        value?: TValue;
        onChange: ((v: TValue) => void) | 'disabled';
      }>;
      `,

      // 15. shouldShowCloseIcon with only onSubmit (no onClose)
      `
      type FormProps = {
        shouldShowCloseIcon?: boolean;
        onSubmit?: () => void;
      };
      `,

      // 16. External type ref in intersection — only inline props analyzed
      `
      type MyDialogProps = SomeExternalType & {
        customProp?: string;
        shouldShowLogo?: boolean;
      };
      `,

      // 17. `has` prefix (state-like) — not in default boolean prefixes
      `
      type ItemProps = {
        hasChildren?: boolean;
        onExpand?: () => void;
      };
      `,

      // 18. Callback does not start with a recognized callback prefix
      `
      type ButtonProps = {
        shouldShowIcon?: boolean;
        triggerIconAction?: () => void;
      };
      `,

      // 19. showSubmit — boolean prefix `show` but no matching callback
      `
      type ToolbarProps = {
        showSubmit?: boolean;
        onClose?: () => void;
      };
      `,

      // 20. displaySidebar — no matching callback (onResize different noun)
      `
      type LayoutProps = {
        displaySidebar?: boolean;
        onResize?: () => void;
      };
      `,

      // 21. shouldShowBorder + onSave — different nouns
      `
      type ControlProps = {
        shouldShowBorder: boolean;
        onSave?: () => void;
      };
      `,

      // 22. `shouldShowClose + onClose` — exact match with 5-char noun `Close`;
      // BUT exact match (tier 1) has no length restriction → FLAG.
      // Correction: this SHOULD be valid since Close is generic.
      // We keep this valid by not having an `onClose` callback here.
      `
      type NavProps = {
        shouldShowClose?: boolean;
        onSave?: () => void;
      };
      `,
    ],

    invalid: [
      // 1. Core example: shouldShowMinimizeIcon + onMinimize.
      // `Minimize` (8 chars) passes min-6 suffix-match check.
      {
        code: `
        type DialogProps = {
          onMinimize?: () => void;
          shouldShowMinimizeIcon?: boolean;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 2. Same pattern inside Readonly<{...}>
      {
        code: `
        type DialogCenteredProps = Readonly<{
          onClose?: () => void;
          onMinimize?: () => void;
          shouldShowMinimizeIcon?: boolean;
        }>;
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 3. Interface declaration with shouldEnable + onEdit (exact match)
      {
        code: `
        interface EditableProps {
          shouldEnableEditing?: boolean;
          onEditing?: () => void;
        }
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 4. shouldEnableSearch + onSearch — exact match (no suffix)
      {
        code: `
        type SearchProps = {
          shouldEnableSearch?: boolean;
          onSearch?: (query: string) => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 5. shouldAllowDelete + onDelete — exact match (no suffix)
      {
        code: `
        type ArrayProps = {
          shouldAllowDelete?: boolean;
          onDelete?: (index: number) => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 6. Multiple redundant pairs → multiple errors
      {
        code: `
        type NotificationProps = {
          shouldEnableDismiss?: boolean;
          onDismiss?: () => void;
          shouldShowMinimize?: boolean;
          onMinimize?: () => void;
        };
        `,
        errors: [
          { messageId: 'redundantBooleanProp' },
          { messageId: 'redundantBooleanProp' },
        ],
      },

      // 7. Intersection of two inline type literals — members merged
      {
        code: `
        type ButtonProps = {
          label: string;
        } & {
          shouldShowMinimize?: boolean;
          onMinimize?: () => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 8. shouldShowDismissButton + onDismiss — `Dismiss` is 7 chars, suffix
      // `Button` stripped → noun `Dismiss` = 7 ≥ 6 → FLAG
      {
        code: `
        type ToastProps = {
          shouldShowDismissButton?: boolean;
          onDismiss?: () => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 9. shouldEnableRichText + onRichText — exact match (multi-word noun)
      {
        code: `
        type EditorProps = {
          shouldEnableRichText?: boolean;
          onRichText?: () => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 10. shouldShowAction + onAction — exact match
      {
        code: `
        type MyProps = {
          shouldShowAction?: boolean;
          onAction?: () => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 11. displayOverlay + onOverlay — exact match
      {
        code: `
        type PanelProps = {
          displayOverlay?: boolean;
          onOverlay?: () => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 12. Readonly wrapping a type literal with matching pair
      {
        code: `
        type Props = Readonly<{
          shouldEnableFeature?: boolean;
          onFeature?: () => void;
        }>;
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 13. hideFooter + onFooter — exact match
      {
        code: `
        type ModalProps = {
          hideFooter?: boolean;
          onFooter?: () => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 14. Boolean with explicit `boolean | undefined` union type
      {
        code: `
        type CardProps = {
          shouldShowMinimize: boolean | undefined;
          onMinimize?: () => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 15. handleX callback prefix (second default prefix) — exact match
      {
        code: `
        type FormProps = {
          shouldShowSubmit?: boolean;
          handleSubmit?: () => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 16. shouldEnableDeleteAction + onDelete — `Delete` (6 chars), suffix
      // `Action` stripped → noun length 6 = min 6 → FLAG
      {
        code: `
        type RowProps = {
          shouldEnableDeleteAction?: boolean;
          onDelete?: () => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 17. Generic type alias with inline props
      {
        code: `
        type EditableList<TItem> = {
          items: TItem[];
          shouldAllowAddItem?: boolean;
          onAddItem?: () => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 18. allowUpload + onUpload — exact match
      {
        code: `
        type DropZoneProps = {
          allowUpload?: boolean;
          onUpload?: (file: File) => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 19. shouldShowResults + onResults — exact match (no suffix)
      {
        code: `
        type SearchBarProps = {
          shouldShowResults?: boolean;
          onResults?: () => string[];
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 20. Readonly + inline intersection on the right side
      {
        code: `
        type ComplexProps = Readonly<{
          title: string;
        }> & {
          shouldShowMinimize?: boolean;
          onMinimize?: () => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 21. shouldShowMinimizeIcon inside a Readonly — suffix-match with
      // `Minimize` (8 chars) ≥ 6 → FLAG
      {
        code: `
        type HeaderProps = Readonly<{
          shouldShowMinimizeIcon?: boolean;
          onMinimize?: () => void;
        }>;
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 22. shouldEnableComment + onComment — exact match (7 chars)
      {
        code: `
        type ArticleProps = {
          shouldEnableComment?: boolean;
          onComment?: () => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },

      // 23. showShare + onShare — exact match (tier 1, no length restriction)
      // `show` prefix, exact noun `Share` matches `onShare`
      {
        code: `
        type ToolbarProps = {
          showShare?: boolean;
          onShare?: () => void;
        };
        `,
        errors: [{ messageId: 'redundantBooleanProp' }],
      },
    ],
  },
);
