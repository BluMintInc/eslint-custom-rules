import { keyOnlyOutermostElement } from '../rules/key-only-outermost-element';
import { ruleTesterJsx } from '../utils/ruleTester';

const nestedKeyError = (elementName: string) => ({
  messageId: 'keyOnlyOutermostElement' as const,
  data: { elementName },
});

const fragmentError = {
  messageId: 'fragmentShouldHaveKey' as const,
};

ruleTesterJsx.run('key-only-outermost-element', keyOnlyOutermostElement, {
  valid: [
    // Basic valid case - key only on outermost element
    `
    {items.map((item) => (
      <div key={item.id}>
        <span>{item.name}</span>
      </div>
    ))}
    `,

    // Valid case with nested map
    `
    {categories.map((category) => (
      <div key={category.id}>
        <h2>{category.name}</h2>
        <ul>
          {category.items.map((item) => (
            <li key={item.id}><span>{item.name}</span></li>
          ))}
        </ul>
      </div>
    ))}
    `,

    // Valid case with React.Fragment
    `
    {items.map((item) => (
      <React.Fragment key={item.id}>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
      </React.Fragment>
    ))}
    `,

    // Valid case with conditional rendering
    `
    {items.length > 0 && items.map((item) => (
      <div key={item.id}>
        <p>{item.name}</p>
      </div>
    ))}
    `,

    // Valid case with component that may handle internal keys
    `
    {items.map((item) => (
      <ListItem key={item.id} item={item} />
    ))}
    `,

    // Valid case with ternary operator
    `
    {isLoading
      ? <LoadingSpinner />
      : items.map((item) => (
          <div key={item.id}>
            <span>{item.name}</span>
          </div>
        ))
    }
    `,

    // Valid case with complex conditional logic
    `
    {isLoading
      ? <LoadingSpinner />
      : items.length === 0
        ? <EmptyState />
        : items.map((item) => (
            <div key={item.id}>
              <span>{item.name}</span>
            </div>
          ))
    }
    `,

    // Valid case with filter before map
    `
    {items
      .filter(item => item.isVisible)
      .map((item) => (
        <div key={item.id}>
          <span>{item.name}</span>
        </div>
      ))
    }
    `,

    // Valid case with deeply nested conditional rendering
    `
    {hasPermission && (
      <div>
        {items.length > 0 && items.map((item) => (
          <div key={item.id}>
            <p>{item.name}</p>
          </div>
        ))}
      </div>
    )}
    `,

    // Valid case with multiple levels of nesting
    `
    {sections.map(section => (
      <section key={section.id}>
        <h2>{section.title}</h2>
        {section.categories.map(category => (
          <div key={category.id}>
            <h3>{category.name}</h3>
            <ul>
              {category.items.map(item => (
                <li key={item.id}>{item.name}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    ))}
    `,

    // Valid case with dynamic component rendering
    `
    {items.map((item) => {
      const Component = getComponentByType(item.type);
      return <Component key={item.id} data={item} />;
    })}
    `,

    // Valid case with complex JSX structure but proper key placement
    `
    {items.map((item) => (
      <div key={item.id} className="item-container">
        <div className="item-header">
          <h3>{item.title}</h3>
          <div className="item-actions">
            <button onClick={() => handleEdit(item)}>Edit</button>
            <button onClick={() => handleDelete(item)}>Delete</button>
          </div>
        </div>
        <div className="item-body">
          <p>{item.description}</p>
          {item.tags.map(tag => (
            <span key={tag.id} className="tag">{tag.name}</span>
          ))}
        </div>
      </div>
    ))}
    `,

    // Valid case with map inside a component prop
    `
    <TabPanel
      tabs={categories.map(category => ({
        id: category.id,
        label: category.name,
        content: (
          <div>
            {category.items.map(item => (
              <div key={item.id}>{item.name}</div>
            ))}
          </div>
        )
      }))}
    />
    `,

    // Nested keys outside any list rendering are nobody's business here, so the
    // import that feeds them is never a removal candidate.
    `
    import { uuidv4Base62 } from 'utils';

    export const Panel = () => (
      <div key={uuidv4Base62()}>
        <span key={uuidv4Base62()}>hello</span>
      </div>
    );
    `,

    // An import read only by the OUTERMOST key: that key is never removed, so
    // nothing here may touch the import.
    `
    import { uuidv4Base62 } from 'utils';

    export const List = ({ items }) => (
      <div>
        {items.map((item) => (
          <div key={uuidv4Base62()}>
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    );
    `,

    // Attributes on either side of a key that stays put.
    `
    {items.map((item) => (
      <div id="x" key={item.id} className="y">
        <span id="a" className="b">{item.name}</span>
      </div>
    ))}
    `,
  ],
  invalid: [
    // Basic invalid case - key on nested element
    {
      code: `
      {items.map((item) => (
        <div key={item.id}>
          <span key={\`inner-\${item.id}\`}>{item.name}</span>
        </div>
      ))}
      `,
      errors: [nestedKeyError('span')],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <span>{item.name}</span>
        </div>
      ))}
      `,
    },

    // Invalid case with multiple nested keys
    {
      code: `
      {items.map((item) => (
        <div key={item.id}>
          <h3 key={\`title-\${item.id}\`}>{item.title}</h3>
          <p key={\`desc-\${item.id}\`}>{item.description}</p>
        </div>
      ))}
      `,
      errors: [nestedKeyError('h3'), nestedKeyError('p')],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
        </div>
      ))}
      `,
    },

    // Invalid case with Fragment shorthand without key but nested elements with keys
    {
      code: `
      {items.map((item) => (
        <>
          <h3 key={\`title-\${item.id}\`}>{item.title}</h3>
          <p key={\`desc-\${item.id}\`}>{item.description}</p>
        </>
      ))}
      `,
      errors: [fragmentError, nestedKeyError('h3'), nestedKeyError('p')],
      output: `
      {items.map((item) => (
        <>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
        </>
      ))}
      `,
    },

    // Invalid case with nested map and redundant keys
    {
      code: `
      {categories.map((category) => (
        <div key={category.id}>
          <h2>{category.name}</h2>
          <ul>
            {category.items.map((item) => (
              <li key={item.id}><span key={\`inner-\${item.id}\`}>{item.name}</span></li>
            ))}
          </ul>
        </div>
      ))}
      `,
      errors: [nestedKeyError('span')],
      output: `
      {categories.map((category) => (
        <div key={category.id}>
          <h2>{category.name}</h2>
          <ul>
            {category.items.map((item) => (
              <li key={item.id}><span>{item.name}</span></li>
            ))}
          </ul>
        </div>
      ))}
      `,
    },

    // Invalid case with conditional rendering and nested keys
    {
      code: `
      {items.length > 0 && items.map((item) => (
        <div key={item.id}>
          <p key={\`p-\${item.id}\`}>{item.name}</p>
        </div>
      ))}
      `,
      errors: [nestedKeyError('p')],
      output: `
      {items.length > 0 && items.map((item) => (
        <div key={item.id}>
          <p>{item.name}</p>
        </div>
      ))}
      `,
    },

    // Invalid case with ternary operator and nested keys
    {
      code: `
      {isLoading
        ? <LoadingSpinner />
        : items.map((item) => (
            <div key={item.id}>
              <span key={\`span-\${item.id}\`}>{item.name}</span>
            </div>
          ))
      }
      `,
      errors: [nestedKeyError('span')],
      output: `
      {isLoading
        ? <LoadingSpinner />
        : items.map((item) => (
            <div key={item.id}>
              <span>{item.name}</span>
            </div>
          ))
      }
      `,
    },

    // Invalid case with key on every element in a deeply nested structure
    {
      code: `
      {items.map((item) => (
        <div key={item.id}>
          <header key={\`header-\${item.id}\`}>
            <h2 key={\`title-\${item.id}\`}>{item.title}</h2>
            <button key={\`btn-\${item.id}\`} onClick={() => handleClick(item)}>Click me</button>
          </header>
          <section key={\`section-\${item.id}\`}>
            <p key={\`desc-\${item.id}\`}>{item.description}</p>
          </section>
        </div>
      ))}
      `,
      errors: [
        nestedKeyError('header'),
        nestedKeyError('h2'),
        nestedKeyError('button'),
        nestedKeyError('section'),
        nestedKeyError('p'),
      ],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <header>
            <h2>{item.title}</h2>
            <button onClick={() => handleClick(item)}>Click me</button>
          </header>
          <section>
            <p>{item.description}</p>
          </section>
        </div>
      ))}
      `,
    },

    // Invalid case with key on element inside a component in map
    {
      code: `
      {items.map((item) => (
        <CustomComponent key={item.id}>
          <div key={\`inner-\${item.id}\`}>{item.name}</div>
        </CustomComponent>
      ))}
      `,
      errors: [nestedKeyError('div')],
      output: `
      {items.map((item) => (
        <CustomComponent key={item.id}>
          <div>{item.name}</div>
        </CustomComponent>
      ))}
      `,
    },

    // Invalid case with multiple maps and keys at wrong levels
    {
      code: `
      <div>
        {categories.map(category => (
          <section key={category.id}>
            <h2>{category.name}</h2>
            {category.items.map(item => (
              <div key={item.id}>
                <h3 key={\`title-\${item.id}\`}>{item.title}</h3>
                <ul>
                  {item.subItems.map(subItem => (
                    <li key={subItem.id}>
                      <span key={\`name-\${subItem.id}\`}>{subItem.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
      `,
      errors: [nestedKeyError('h3'), nestedKeyError('span')],
      output: `
      <div>
        {categories.map(category => (
          <section key={category.id}>
            <h2>{category.name}</h2>
            {category.items.map(item => (
              <div key={item.id}>
                <h3>{item.title}</h3>
                <ul>
                  {item.subItems.map(subItem => (
                    <li key={subItem.id}>
                      <span>{subItem.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
      `,
    },

    // Invalid case with dynamic component rendering and nested keys
    {
      code: `
      {items.map((item) => {
        const Component = getComponentByType(item.type);
        return (
          <Component key={item.id}>
            <div key={\`content-\${item.id}\`}>{item.content}</div>
          </Component>
        );
      })}
      `,
      errors: [nestedKeyError('div')],
      output: `
      {items.map((item) => {
        const Component = getComponentByType(item.type);
        return (
          <Component key={item.id}>
            <div>{item.content}</div>
          </Component>
        );
      })}
      `,
    },

    // Invalid case with complex conditional logic and nested keys
    {
      code: `
      {isLoading
        ? <LoadingSpinner />
        : items.length === 0
          ? <EmptyState />
          : items.map((item) => (
              <div key={item.id} className="item">
                <header key={\`header-\${item.id}\`}>
                  <h3>{item.title}</h3>
                </header>
              </div>
            ))
      }
      `,
      errors: [nestedKeyError('header')],
      output: `
      {isLoading
        ? <LoadingSpinner />
        : items.length === 0
          ? <EmptyState />
          : items.map((item) => (
              <div key={item.id} className="item">
                <header>
                  <h3>{item.title}</h3>
                </header>
              </div>
            ))
      }
      `,
    },

    // Invalid case with Fragment that should use React.Fragment with key
    {
      code: `
      {items.map((item) => (
        <>
          <div>{item.title}</div>
          <div>{item.description}</div>
        </>
      ))}
      `,
      errors: [fragmentError],
      output: `
      {items.map((item) => (
        <>
          <div>{item.title}</div>
          <div>{item.description}</div>
        </>
      ))}
      `,
    },

    /* ---------------------------------------------------------------- *
     * Attribute-list positions. The removed span reaches BACKWARD over
     * whitespace, which is the only choice correct at every position: eating
     * the trailing space instead leaves `<div >` at the end of a list and
     * fuses `id="x"className="y"` in the middle of one.
     * ---------------------------------------------------------------- */

    // key FIRST in the attribute list
    {
      code: `
      {items.map((item) => (
        <div key={item.id}>
          <span key={item.name} id="x" className="y">{item.name}</span>
        </div>
      ))}
      `,
      errors: [nestedKeyError('span')],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <span id="x" className="y">{item.name}</span>
        </div>
      ))}
      `,
    },

    // key in the MIDDLE of the attribute list
    {
      code: `
      {items.map((item) => (
        <div key={item.id}>
          <span id="x" key={item.name} className="y">{item.name}</span>
        </div>
      ))}
      `,
      errors: [nestedKeyError('span')],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <span id="x" className="y">{item.name}</span>
        </div>
      ))}
      `,
    },

    // key LAST in the attribute list
    {
      code: `
      {items.map((item) => (
        <div key={item.id}>
          <span id="x" className="y" key={item.name}>{item.name}</span>
        </div>
      ))}
      `,
      errors: [nestedKeyError('span')],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <span id="x" className="y">{item.name}</span>
        </div>
      ))}
      `,
    },

    // key as the ONLY attribute
    {
      code: `
      {items.map((item) => (
        <div key={item.id}>
          <span key={item.name}>{item.name}</span>
        </div>
      ))}
      `,
      errors: [nestedKeyError('span')],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <span>{item.name}</span>
        </div>
      ))}
      `,
    },

    // key as the only attribute of a self-closing element
    {
      code: `
      {items.map((item) => (
        <div key={item.id}>
          <Icon key={item.name} />
        </div>
      ))}
      `,
      errors: [nestedKeyError('Icon')],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <Icon />
        </div>
      ))}
      `,
    },

    // key on its own line of a multi-line attribute list
    {
      code: `
      {items.map((item) => (
        <div key={item.id}>
          <span
            id="x"
            key={item.name}
            className="y"
          >{item.name}</span>
        </div>
      ))}
      `,
      errors: [nestedKeyError('span')],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <span
            id="x"
            className="y"
          >{item.name}</span>
        </div>
      ))}
      `,
    },

    // A comment beside the key is not whitespace, so it stays where its author
    // put it.
    {
      code: `
      {items.map((item) => (
        <div key={item.id}>
          <span id="x" /* note */ key={item.name} className="y">{item.name}</span>
        </div>
      ))}
      `,
      errors: [nestedKeyError('span')],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <span id="x" /* note */ className="y">{item.name}</span>
        </div>
      ))}
      `,
    },

    // A valueless key attribute
    {
      code: `
      {items.map((item) => (
        <div key={item.id}>
          <span id="x" key className="y">{item.name}</span>
        </div>
      ))}
      `,
      errors: [nestedKeyError('span')],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <span id="x" className="y">{item.name}</span>
        </div>
      ))}
      `,
    },

    // A spread sits immediately before the key
    {
      code: `
      {items.map((item) => (
        <div key={item.id}>
          <span {...item.props} key={item.name}>{item.name}</span>
        </div>
      ))}
      `,
      errors: [nestedKeyError('span')],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <span {...item.props}>{item.name}</span>
        </div>
      ))}
      `,
    },

    /* ---------------------------------------------------------------- *
     * Orphaned bindings (#1904). Removing a key deletes the expression that
     * read it, so the import that fed it leaves with the same fix.
     * ---------------------------------------------------------------- */

    // The issue's repro: the key expression held the import's only reference.
    {
      code: `
import React from 'react';
import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <>
        <div key={uuidv4Base62()}>
          {item.name}
        </div>
      </>
    ))}
  </div>
);
`,
      errors: [fragmentError, nestedKeyError('div')],
      output: `
import React from 'react';

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <>
        <div>
          {item.name}
        </div>
      </>
    ))}
  </div>
);
`,
    },

    // Two keys jointly hold one import alive. Neither may unbind it alone, so
    // ONE fix removes both keys and the import together.
    {
      code: `
import { uuidv4Base62 } from 'utils';

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span key={uuidv4Base62()}>{item.name}</span>
        <b key={uuidv4Base62()}>{item.name}</b>
      </div>
    ))}
  </div>
);
`,
      errors: [nestedKeyError('span'), nestedKeyError('b')],
      output: `

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span>{item.name}</span>
        <b>{item.name}</b>
      </div>
    ))}
  </div>
);
`,
    },

    // Only the orphaned specifier leaves; its neighbour stays.
    {
      code: `
import { uuidv4Base62, formatName } from 'utils';

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span key={uuidv4Base62()}>{formatName(item)}</span>
      </div>
    ))}
  </div>
);
`,
      errors: [nestedKeyError('span')],
      output: `
import { formatName } from 'utils';

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span>{formatName(item)}</span>
      </div>
    ))}
  </div>
);
`,
    },

    // A default import is unbound the same way.
    {
      code: `
import makeKey from 'utils';

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span key={makeKey(item)}>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
      errors: [nestedKeyError('span')],
      output: `

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
    },

    // So is a namespace import.
    {
      code: `
import * as keys from 'utils';

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span key={keys.make(item)}>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
      errors: [nestedKeyError('span')],
      output: `

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
    },

    // An aliased specifier is judged by its LOCAL name.
    {
      code: `
import { uuidv4Base62 as mk } from 'utils';

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span key={mk()}>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
      errors: [nestedKeyError('span')],
      output: `

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
    },

    /* ---------------------------------------------------------------- *
     * The import SURVIVES whenever anything else still reads it. An
     * over-eager removal is the worse bug, so each surviving channel is
     * pinned by its own fixture.
     * ---------------------------------------------------------------- */

    // Still called outside any JSX.
    {
      code: `
import { uuidv4Base62 } from 'utils';

export const id = uuidv4Base62();

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span key={uuidv4Base62()}>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
      errors: [nestedKeyError('span')],
      output: `
import { uuidv4Base62 } from 'utils';

export const id = uuidv4Base62();

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
    },

    // Still read by a key that STAYS — the one on the outermost element.
    {
      code: `
import { uuidv4Base62 } from 'utils';

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={uuidv4Base62()}>
        <span key={uuidv4Base62()}>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
      errors: [nestedKeyError('span')],
      output: `
import { uuidv4Base62 } from 'utils';

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={uuidv4Base62()}>
        <span>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
    },

    // Still re-exported.
    {
      code: `
import { uuidv4Base62 } from 'utils';

export { uuidv4Base62 };

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span key={uuidv4Base62()}>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
      errors: [nestedKeyError('span')],
      output: `
import { uuidv4Base62 } from 'utils';

export { uuidv4Base62 };

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
    },

    // Still named by a type position.
    {
      code: `
import { uuidv4Base62 } from 'utils';

export type Maker = typeof uuidv4Base62;

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span key={uuidv4Base62()}>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
      errors: [nestedKeyError('span')],
      output: `
import { uuidv4Base62 } from 'utils';

export type Maker = typeof uuidv4Base62;

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
    },

    // A SUPPRESSED sibling report never fixes, so the key it would have removed
    // still holds the import. Only the unsuppressed key goes, and the import
    // stays.
    {
      code: `
import { uuidv4Base62 } from 'utils';

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        {/* eslint-disable-next-line key-only-outermost-element */}
        <span key={uuidv4Base62()}>{item.name}</span>
        <b key={uuidv4Base62()}>{item.name}</b>
      </div>
    ))}
  </div>
);
`,
      errors: [nestedKeyError('b')],
      output: `
import { uuidv4Base62 } from 'utils';

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        {/* eslint-disable-next-line key-only-outermost-element */}
        <span key={uuidv4Base62()}>{item.name}</span>
        <b>{item.name}</b>
      </div>
    ))}
  </div>
);
`,
    },

    /* ---------------------------------------------------------------- *
     * Deliberate declines. The report stands; the fix is withheld because
     * the removal would strand a binding this rule must not rewrite.
     * `output: null` asserts the file is left alone — an omitted `output`
     * would assert nothing.
     * ---------------------------------------------------------------- */

    // The map callback's parameter is read by nothing but the doomed key.
    {
      code: `
export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key="static">
        <span key={item.id}>name</span>
      </div>
    ))}
  </div>
);
`,
      errors: [nestedKeyError('span')],
      output: null,
    },

    // A local helper this rule has no business deleting.
    {
      code: `
const makeKey = () => Math.random();

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span key={makeKey()}>{item.name}</span>
      </div>
    ))}
  </div>
);
`,
      errors: [nestedKeyError('span')],
      output: null,
    },

    // A comment among the specifiers: the removal span reaches across
    // separators, so the comment would be swallowed or stranded.
    {
      code: `
import {
  // the id generator
  uuidv4Base62,
  formatName,
} from 'utils';

export const List = ({ items }) => (
  <div>
    {items.map((item) => (
      <div key={item.id}>
        <span key={uuidv4Base62()}>{formatName(item)}</span>
      </div>
    ))}
  </div>
);
`,
      errors: [nestedKeyError('span')],
      output: null,
    },
  ],
});
