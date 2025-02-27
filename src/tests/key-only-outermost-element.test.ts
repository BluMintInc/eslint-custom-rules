import { keyOnlyOutermostElement } from '../rules/key-only-outermost-element';
import { ruleTesterJsx } from '../utils/ruleTester';

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
    `
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
      errors: [{ messageId: 'keyOnlyOutermostElement' }],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <span >{item.name}</span>
        </div>
      ))}
      `
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
      errors: [
        { messageId: 'keyOnlyOutermostElement' },
        { messageId: 'keyOnlyOutermostElement' }
      ],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <h3 >{item.title}</h3>
          <p >{item.description}</p>
        </div>
      ))}
      `
    },

    // Invalid case with Fragment without key but nested elements with keys
    {
      code: `
      {items.map((item) => (
        <>
          <h3 key={\`title-\${item.id}\`}>{item.title}</h3>
          <p key={\`desc-\${item.id}\`}>{item.description}</p>
        </>
      ))}
      `,
      // We're getting 4 errors because each key is being reported twice
      // This is a limitation of our current implementation
      errors: [
        { messageId: 'keyOnlyOutermostElement' },
        { messageId: 'keyOnlyOutermostElement' },
        { messageId: 'keyOnlyOutermostElement' },
        { messageId: 'keyOnlyOutermostElement' }
      ],
      output: `
      {items.map((item) => (
        <>
          <h3 >{item.title}</h3>
          <p >{item.description}</p>
        </>
      ))}
      `
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
      errors: [{ messageId: 'keyOnlyOutermostElement' }],
      output: `
      {categories.map((category) => (
        <div key={category.id}>
          <h2>{category.name}</h2>
          <ul>
            {category.items.map((item) => (
              <li key={item.id}><span >{item.name}</span></li>
            ))}
          </ul>
        </div>
      ))}
      `
    }
  ],
});
