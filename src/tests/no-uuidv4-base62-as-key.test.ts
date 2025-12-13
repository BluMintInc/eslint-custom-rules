import { noUuidv4Base62AsKey } from '../rules/no-uuidv4-base62-as-key';
import { ruleTesterJsx } from '../utils/ruleTester';

const error = (keyExpression: string) => ({
  messageId: 'noUuidv4Base62AsKey' as const,
  data: { keyExpression },
});

ruleTesterJsx.run('no-uuidv4-base62-as-key', noUuidv4Base62AsKey, {
  valid: [
    // Using item.id as key (good practice)
    `
    import React from 'react';
    
    {items.map((item) => (
      <div key={item.id}>{item.name}</div>
    ))}
    `,

    // Using a combination of properties as key
    `
    import React from 'react';
    
    {items.map((item) => (
      <div key={\`\${item.name}-\${item.index}\`}>{item.name}</div>
    ))}
    `,

    // Using index as key (not ideal but better than random UUID)
    `
    import React from 'react';
    
    {items.map((item, index) => (
      <div key={index}>{item.name}</div>
    ))}
    `,

    // Using a stable identifier function
    `
    import React from 'react';
    import { getStableId } from '@blumint/utils';
    
    {items.map((item) => (
      <div key={getStableId(item)}>{item.name}</div>
    ))}
    `,

    // Using a hash function
    `
    import React from 'react';
    import { hashObject } from '@blumint/utils';
    
    {items.map((item) => (
      <div key={hashObject(item)}>{item.name}</div>
    ))}
    `,

    // Using uuidv4Base62 but not as a key
    `
    import React from 'react';
    import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
    
    {items.map((item) => {
      const id = uuidv4Base62();
      console.log(id);
      return <div key={item.id}>{item.name}</div>;
    })}
    `,

    // Using uuidv4Base62 in a non-key attribute
    `
    import React from 'react';
    import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
    
    {items.map((item) => (
      <div key={item.id} data-random-id={uuidv4Base62()}>{item.name}</div>
    ))}
    `,

    // Using React.Fragment with proper key
    `
    import React from 'react';
    
    {items.map((item) => (
      <React.Fragment key={item.id}>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
      </React.Fragment>
    ))}
    `,

    // Nested maps with proper keys
    `
    import React from 'react';
    
    {categories.map((category) => (
      <div key={category.id}>
        <h2>{category.name}</h2>
        <ul>
          {category.items.map((item) => (
            <li key={item.id}>{item.name}</li>
          ))}
        </ul>
      </div>
    ))}
    `,

    // Using a different UUID function (not uuidv4Base62)
    `
    import React from 'react';
    import { uuid } from 'uuid';
    
    {items.map((item) => (
      <div key={uuid()}>{item.name}</div>
    ))}
    `,

    // Using a different UUID function with different name
    `
    import React from 'react';
    import { generateUUID } from 'some-uuid-library';
    
    {items.map((item) => (
      <div key={generateUUID()}>{item.name}</div>
    ))}
    `,

    // ADDITIONAL VALID TESTS

    // Using a variable that happens to be named uuidv4Base62 but is not a function call
    `
    import React from 'react';
    
    const uuidv4Base62 = 'static-id';
    {items.map((item) => (
      <div key={uuidv4Base62 + item.id}>{item.name}</div>
    ))}
    `,

    // Using a method with similar name but not exactly uuidv4Base62
    `
    import React from 'react';
    import { uuidv4Base62Stable } from '@blumint/utils';
    
    {items.map((item) => (
      <div key={uuidv4Base62Stable(item)}>{item.name}</div>
    ))}
    `,

    // Using a memoized UUID that doesn't change on re-renders
    `
    import React from 'react';
    import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
    
    function Component() {
      const memoizedIds = React.useMemo(() => {
        return items.map(() => uuidv4Base62());
      }, [items.length]);
      return (
        <div>
          {items.map((item, index) => (
            <div key={memoizedIds[index]}>{item.name}</div>
          ))}
        </div>
      );
    }
    `,

    // Using a constant array with index as key (acceptable use case)
    `
    import React from 'react';
    
    const COLORS = ['red', 'blue', 'green'];
    const ColorList = () => (
      <ul>
        {COLORS.map((color, index) => (
          <li key={index}>{color}</li>
        ))}
      </ul>
    );
    `,

    // Using a function that returns a component with proper keys
    `
    import React from 'react';
    
    const renderItem = (item) => <div key={item.id}>{item.name}</div>;
    {items.map(renderItem)}
    `,

    // Using a higher-order component that handles keys internally
    `
    import React from 'react';
    
    {items.map(withProperKey(item => (
      <div>{item.name}</div>
    )))}
    `,

    // Using a key in a non-map context (direct array)
    `
    import React from 'react';
    
    const listItems = [
      <div key="item-1">Item 1</div>,
      <div key="item-2">Item 2</div>,
      <div key="item-3">Item 3</div>
    ];
    `,

    // Using a key with a complex expression that doesn't involve uuidv4Base62
    `
    import React from 'react';
    
    {items.map((item) => (
      <div key={item.id ? item.id : \`fallback-\${item.name}-\${index}\`}>{item.name}</div>
    ))}
    `,

    // Using a key with a function that takes uuidv4Base62 as an argument
    `
    import React from 'react';
    import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
    
    {items.map((item) => (
      <div key={processKey(item, uuidv4Base62)}>{item.name}</div>
    ))}
    `,

    // Using a key in a component that's not directly in a map
    `
    import React from 'react';
    
    function ItemList({ items }) {
      return items.map(item => {
        const itemContent = <span>{item.name}</span>;
        return <div key={item.id}>{itemContent}</div>;
      });
    }
    `,

    // Using a key with a function that has uuidv4Base62 in its name but isn't the function
    `
    import React from 'react';
    
    {items.map((item) => (
      <div key={get_uuidv4Base62_alternative(item)}>{item.name}</div>
    ))}
    `,

    // Using a key with a destructured function that isn't uuidv4Base62
    `
    import React from 'react';
    
    const { generateId } = utils;
    {items.map((item) => (
      <div key={generateId()}>{item.name}</div>
    ))}
    `,
  ],
  invalid: [
    // Basic case using uuidv4Base62 as key
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => (
        <div key={uuidv4Base62()}>{item.name}</div>
      ))}
      `,
      errors: [error('uuidv4Base62()')],
    },
    {
      // Using a pre-generated UUID outside the map function
      code: `import React from 'react';
        import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
        
        const itemKeys = items.map(item => ({ ...item, key: uuidv4Base62() }));
        {itemKeys.map((item) => (
          <div key={item.key}>{item.name}</div>
        ))}
        `,
      errors: [error('item.key')],
    },

    // Using uuidv4Base62 with React.Fragment
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => (
        <React.Fragment key={uuidv4Base62()}>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
        </React.Fragment>
      ))}
      `,
      errors: [error('uuidv4Base62()')],
    },

    // Using uuidv4Base62 in a nested map
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {categories.map((category) => (
        <div key={category.id}>
          <h2>{category.name}</h2>
          <ul>
            {category.items.map((item) => (
              <li key={uuidv4Base62()}>{item.name}</li>
            ))}
          </ul>
        </div>
      ))}
      `,
      errors: [error('uuidv4Base62()')],
    },

    // Using uuidv4Base62 in a conditional rendering
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {isLoading
        ? <LoadingSpinner />
        : items.map((item) => (
            <div key={uuidv4Base62()}>
              <span>{item.name}</span>
            </div>
          ))
      }
      `,
      errors: [error('uuidv4Base62()')],
    },

    // Using uuidv4Base62 in a logical expression
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.length > 0 && items.map((item) => (
        <div key={uuidv4Base62()}>
          <p>{item.name}</p>
        </div>
      ))}
      `,
      errors: [error('uuidv4Base62()')],
    },

    // Using uuidv4Base62 with a custom component
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => (
        <CustomComponent key={uuidv4Base62()}>
          <div>{item.name}</div>
        </CustomComponent>
      ))}
      `,
      errors: [error('uuidv4Base62()')],
    },

    // Using uuidv4Base62 in a complex structure
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {sections.map(section => (
        <section key={uuidv4Base62()}>
          <h2>{section.title}</h2>
          {section.categories.map(category => (
            <div key={category.id}>
              <h3>{category.name}</h3>
            </div>
          ))}
        </section>
      ))}
      `,
      errors: [error('uuidv4Base62()')],
    },

    // Using uuidv4Base62 with dynamic component rendering
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => {
        const Component = getComponentByType(item.type);
        return <Component key={uuidv4Base62()} data={item} />;
      })}
      `,
      errors: [error('uuidv4Base62()')],
    },

    // ADDITIONAL INVALID TESTS

    // Using uuidv4Base62 with template literals
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => (
        <div key={\`prefix-\${uuidv4Base62()}\`}>{item.name}</div>
      ))}
      `,
      errors: [error('`prefix-${uuidv4Base62()}`')],
    },

    // Using uuidv4Base62 with string concatenation
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => (
        <div key={'prefix-' + uuidv4Base62()}>{item.name}</div>
      ))}
      `,
      errors: [error("'prefix-' + uuidv4Base62()")],
    },

    // Using uuidv4Base62 with a ternary operator
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => (
        <div key={item.id ? item.id : uuidv4Base62()}>{item.name}</div>
      ))}
      `,
      errors: [error('item.id ? item.id : uuidv4Base62()')],
    },

    // Using uuidv4Base62 with logical OR for fallback
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => (
        <div key={item.id || uuidv4Base62()}>{item.name}</div>
      ))}
      `,
      errors: [error('item.id || uuidv4Base62()')],
    },

    // Using uuidv4Base62 with nullish coalescing
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => (
        <div key={item.id ?? uuidv4Base62()}>{item.name}</div>
      ))}
      `,
      errors: [error('item.id ?? uuidv4Base62()')],
    },
    {
      // Using a key with a renamed imported function
      code: `
      import React from 'react';
      import { uuidv4Base62 as generateStableId } from '@blumint/utils/uuidv4Base62';
      
    {items.map((item) => (
          <div key={generateStableId(item)}>{item.name}</div>
        ))}
      `,
      errors: [error('generateStableId(item)')],
    },

    // Using uuidv4Base62 in a complex expression
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => (
        <div key={prefix + '-' + uuidv4Base62() + '-' + suffix}>{item.name}</div>
      ))}
      `,
      errors: [error("prefix + '-' + uuidv4Base62() + '-' + suffix")],
    },

    // Using uuidv4Base62 with arguments
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => (
        <div key={uuidv4Base62(item.name)}>{item.name}</div>
      ))}
      `,
      errors: [error('uuidv4Base62(item.name)')],
    },

    // Using uuidv4Base62 in a function call
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => (
        <div key={formatKey(uuidv4Base62())}>{item.name}</div>
      ))}
      `,
      errors: [error('formatKey(uuidv4Base62())')],
    },

    // Using uuidv4Base62 in a deeply nested map
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {categories.map(category => (
        <div key={category.id}>
          {category.subcategories.map(subcategory => (
            <div key={subcategory.id}>
              {subcategory.items.map(item => (
                <div key={uuidv4Base62()}>{item.name}</div>
              ))}
            </div>
          ))}
        </div>
      ))}
      `,
      errors: [error('uuidv4Base62()')],
    },

    // Using uuidv4Base62 in multiple places in the same map
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => (
        <div key={uuidv4Base62()}>
          <span key={uuidv4Base62()}>{item.name}</span>
        </div>
      ))}
      `,
      errors: [error('uuidv4Base62()'), error('uuidv4Base62()')],
    },

    // Using uuidv4Base62 in a map with destructuring
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map(({ name, description }) => (
        <div key={uuidv4Base62()}>
          <h3>{name}</h3>
          <p>{description}</p>
        </div>
      ))}
      `,
      errors: [error('uuidv4Base62()')],
    },

    // Using uuidv4Base62 in a map with a complex callback
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => {
        const { name, description } = item;
        const isActive = activeItems.includes(item.id);
        return (
          <div key={uuidv4Base62()} className={isActive ? 'active' : ''}>
            <h3>{name}</h3>
            <p>{description}</p>
          </div>
        );
      })}
      `,
      errors: [error('uuidv4Base62()')],
    },

    // Using uuidv4Base62 in a map with early returns
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => {
        if (!item.visible) return null;
        return (
          <div key={uuidv4Base62()}>
            {item.name}
          </div>
        );
      })}
      `,
      errors: [error('uuidv4Base62()')],
    },

    // Using uuidv4Base62 in a map with filter
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items
        .filter(item => item.visible)
        .map((item) => (
          <div key={uuidv4Base62()}>
            {item.name}
          </div>
        ))
      }
      `,
      errors: [error('uuidv4Base62()')],
    },

    // Using uuidv4Base62 in a map with sort
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => (
          <div key={uuidv4Base62()}>
            {item.name}
          </div>
        ))
      }
      `,
      errors: [error('uuidv4Base62()')],
    },

    // Using uuidv4Base62 in a Fragment shorthand syntax
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => (
        <>
          <div key={uuidv4Base62()}>
            {item.name}
          </div>
        </>
      ))}
      `,
      errors: [error('uuidv4Base62()')],
    },

    // Using uuidv4Base62 in a map with a switch statement
    {
      code: `
      import React from 'react';
      import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';
      
      {items.map((item) => {
        let content;
        switch (item.type) {
          case 'text':
            content = <p>{item.text}</p>;
            break;
          case 'image':
            content = <img src={item.src} alt={item.alt} />;
            break;
          default:
            content = <span>{item.name}</span>;
        }
        return <div key={uuidv4Base62()}>{content}</div>;
      })}
      `,
      errors: [error('uuidv4Base62()')],
    },
  ],
});
