import { noUuidv4Base62AsKey } from '../rules/no-uuidv4-base62-as-key';
import { ruleTesterJsx } from '../utils/ruleTester';

ruleTesterJsx.run('no-uuidv4-base62-as-key', noUuidv4Base62AsKey, {
  valid: [
    // Using item.id as key (good practice)
    `
    {items.map((item) => (
      <div key={item.id}>{item.name}</div>
    ))}
    `,

    // Using a combination of properties as key
    `
    {items.map((item) => (
      <div key={\`\${item.name}-\${item.index}\`}>{item.name}</div>
    ))}
    `,

    // Using index as key (not ideal but better than random UUID)
    `
    {items.map((item, index) => (
      <div key={index}>{item.name}</div>
    ))}
    `,

    // Using a stable identifier function
    `
    {items.map((item) => (
      <div key={getStableId(item)}>{item.name}</div>
    ))}
    `,

    // Using a hash function
    `
    {items.map((item) => (
      <div key={hashObject(item)}>{item.name}</div>
    ))}
    `,

    // Using uuidv4Base62 but not as a key
    `
    {items.map((item) => {
      const id = uuidv4Base62();
      console.log(id);
      return <div key={item.id}>{item.name}</div>;
    })}
    `,

    // Using uuidv4Base62 in a non-key attribute
    `
    {items.map((item) => (
      <div key={item.id} data-random-id={uuidv4Base62()}>{item.name}</div>
    ))}
    `,

    // Using React.Fragment with proper key
    `
    {items.map((item) => (
      <React.Fragment key={item.id}>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
      </React.Fragment>
    ))}
    `,

    // Nested maps with proper keys
    `
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
    {items.map((item) => (
      <div key={uuid()}>{item.name}</div>
    ))}
    `,

    // Using a different UUID function with different name
    `
    {items.map((item) => (
      <div key={generateUUID()}>{item.name}</div>
    ))}
    `,

    // ADDITIONAL VALID TESTS

    // Using a variable that happens to be named uuidv4Base62 but is not a function call
    `
    const uuidv4Base62 = 'static-id';
    {items.map((item) => (
      <div key={uuidv4Base62 + item.id}>{item.name}</div>
    ))}
    `,

    // Using a pre-generated UUID outside the map function
    `
    const itemKeys = items.map(item => ({ ...item, key: uuidv4Base62() }));
    {itemKeys.map((item) => (
      <div key={item.key}>{item.name}</div>
    ))}
    `,

    // Using a method with similar name but not exactly uuidv4Base62
    `
    {items.map((item) => (
      <div key={uuidv4Base62Stable(item)}>{item.name}</div>
    ))}
    `,

    // Using a memoized UUID that doesn't change on re-renders
    `
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
    const renderItem = (item) => <div key={item.id}>{item.name}</div>;
    {items.map(renderItem)}
    `,

    // Using a higher-order component that handles keys internally
    `
    {items.map(withProperKey(item => (
      <div>{item.name}</div>
    )))}
    `,

    // Using a key in a non-map context (direct array)
    `
    const listItems = [
      <div key="item-1">Item 1</div>,
      <div key="item-2">Item 2</div>,
      <div key="item-3">Item 3</div>
    ];
    `,

    // Using a key with a complex expression that doesn't involve uuidv4Base62
    `
    {items.map((item) => (
      <div key={item.id ? item.id : \`fallback-\${item.name}-\${index}\`}>{item.name}</div>
    ))}
    `,

    // Using a key with a function that takes uuidv4Base62 as an argument
    `
    {items.map((item) => (
      <div key={processKey(item, uuidv4Base62)}>{item.name}</div>
    ))}
    `,

    // Using a key in a component that's not directly in a map
    `
    function ItemList({ items }) {
      return items.map(item => {
        const itemContent = <span>{item.name}</span>;
        return <div key={item.id}>{itemContent}</div>;
      });
    }
    `,

    // Using a key with a function that has uuidv4Base62 in its name but isn't the function
    `
    {items.map((item) => (
      <div key={get_uuidv4Base62_alternative(item)}>{item.name}</div>
    ))}
    `,

    // Using a key with a destructured function that isn't uuidv4Base62
    `
    const { generateId } = utils;
    {items.map((item) => (
      <div key={generateId()}>{item.name}</div>
    ))}
    `,

    // Using a key with a renamed imported function
    `
    import { uuidv4Base62 as generateStableId } from 'utils';
    {items.map((item) => (
      <div key={generateStableId(item)}>{item.name}</div>
    ))}
    `
  ],
  invalid: [
    // Basic case using uuidv4Base62 as key
    {
      code: `
      {items.map((item) => (
        <div key={uuidv4Base62()}>{item.name}</div>
      ))}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 with React.Fragment
    {
      code: `
      {items.map((item) => (
        <React.Fragment key={uuidv4Base62()}>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
        </React.Fragment>
      ))}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 in a nested map
    {
      code: `
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
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 in a conditional rendering
    {
      code: `
      {isLoading
        ? <LoadingSpinner />
        : items.map((item) => (
            <div key={uuidv4Base62()}>
              <span>{item.name}</span>
            </div>
          ))
      }
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 in a logical expression
    {
      code: `
      {items.length > 0 && items.map((item) => (
        <div key={uuidv4Base62()}>
          <p>{item.name}</p>
        </div>
      ))}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 with a custom component
    {
      code: `
      {items.map((item) => (
        <CustomComponent key={uuidv4Base62()}>
          <div>{item.name}</div>
        </CustomComponent>
      ))}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 in a complex structure
    {
      code: `
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
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 with dynamic component rendering
    {
      code: `
      {items.map((item) => {
        const Component = getComponentByType(item.type);
        return <Component key={uuidv4Base62()} data={item} />;
      })}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // ADDITIONAL INVALID TESTS

    // Using uuidv4Base62 with template literals
    {
      code: `
      {items.map((item) => (
        <div key={\`prefix-\${uuidv4Base62()}\`}>{item.name}</div>
      ))}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 with string concatenation
    {
      code: `
      {items.map((item) => (
        <div key={'prefix-' + uuidv4Base62()}>{item.name}</div>
      ))}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 with a ternary operator
    {
      code: `
      {items.map((item) => (
        <div key={item.id ? item.id : uuidv4Base62()}>{item.name}</div>
      ))}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 with logical OR for fallback
    {
      code: `
      {items.map((item) => (
        <div key={item.id || uuidv4Base62()}>{item.name}</div>
      ))}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 with nullish coalescing
    {
      code: `
      {items.map((item) => (
        <div key={item.id ?? uuidv4Base62()}>{item.name}</div>
      ))}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 in a complex expression
    {
      code: `
      {items.map((item) => (
        <div key={prefix + '-' + uuidv4Base62() + '-' + suffix}>{item.name}</div>
      ))}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 with arguments
    {
      code: `
      {items.map((item) => (
        <div key={uuidv4Base62(item.name)}>{item.name}</div>
      ))}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 in a function call
    {
      code: `
      {items.map((item) => (
        <div key={formatKey(uuidv4Base62())}>{item.name}</div>
      ))}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },


    // Using uuidv4Base62 in a deeply nested map
    {
      code: `
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
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 in multiple places in the same map
    {
      code: `
      {items.map((item) => (
        <div key={uuidv4Base62()}>
          <span key={uuidv4Base62()}>{item.name}</span>
        </div>
      ))}
      `,
      errors: [
        { messageId: 'noUuidv4Base62AsKey' },
      ]
    },

    // Using uuidv4Base62 in a map with destructuring
    {
      code: `
      {items.map(({ name, description }) => (
        <div key={uuidv4Base62()}>
          <h3>{name}</h3>
          <p>{description}</p>
        </div>
      ))}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 in a map with a complex callback
    {
      code: `
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
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 in a map with early returns
    {
      code: `
      {items.map((item) => {
        if (!item.visible) return null;
        return (
          <div key={uuidv4Base62()}>
            {item.name}
          </div>
        );
      })}
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 in a map with filter
    {
      code: `
      {items
        .filter(item => item.visible)
        .map((item) => (
          <div key={uuidv4Base62()}>
            {item.name}
          </div>
        ))
      }
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 in a map with sort
    {
      code: `
      {items
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => (
          <div key={uuidv4Base62()}>
            {item.name}
          </div>
        ))
      }
      `,
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    },

    // Using uuidv4Base62 in a Fragment shorthand syntax
    {
      code: `
      {items.map((item) => (
        <>
          <div key={uuidv4Base62()}>
            {item.name}
          </div>
        </>
      ))}
      `,
      errors: [
        { messageId: 'noUuidv4Base62AsKey' },
      ]
    },

    // Using uuidv4Base62 in a map with a switch statement
    {
      code: `
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
      errors: [{ messageId: 'noUuidv4Base62AsKey' }]
    }
  ],
});
