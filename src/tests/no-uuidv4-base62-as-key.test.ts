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
    }
  ],
});
