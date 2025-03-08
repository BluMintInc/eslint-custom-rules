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
      errors: [
        { messageId: 'keyOnlyOutermostElement' },
        { messageId: 'keyOnlyOutermostElement' },
      ],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <h3 >{item.title}</h3>
          <p >{item.description}</p>
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
      errors: [
        { messageId: 'fragmentShouldHaveKey' },
        { messageId: 'keyOnlyOutermostElement' },
        { messageId: 'keyOnlyOutermostElement' },
      ],
      output: `
      {items.map((item) => (
        <>
          <h3 >{item.title}</h3>
          <p >{item.description}</p>
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
      errors: [{ messageId: 'keyOnlyOutermostElement' }],
      output: `
      {items.length > 0 && items.map((item) => (
        <div key={item.id}>
          <p >{item.name}</p>
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
      errors: [{ messageId: 'keyOnlyOutermostElement' }],
      output: `
      {isLoading
        ? <LoadingSpinner />
        : items.map((item) => (
            <div key={item.id}>
              <span >{item.name}</span>
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
        { messageId: 'keyOnlyOutermostElement' },
        { messageId: 'keyOnlyOutermostElement' },
        { messageId: 'keyOnlyOutermostElement' },
        { messageId: 'keyOnlyOutermostElement' },
        { messageId: 'keyOnlyOutermostElement' },
      ],
      output: `
      {items.map((item) => (
        <div key={item.id}>
          <header >
            <h2 >{item.title}</h2>
            <button onClick={() => handleClick(item)}>Click me</button>
          </header>
          <section >
            <p >{item.description}</p>
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
      errors: [{ messageId: 'keyOnlyOutermostElement' }],
      output: `
      {items.map((item) => (
        <CustomComponent key={item.id}>
          <div >{item.name}</div>
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
      errors: [
        { messageId: 'keyOnlyOutermostElement' },
        { messageId: 'keyOnlyOutermostElement' },
      ],
      output: `
      <div>
        {categories.map(category => (
          <section key={category.id}>
            <h2>{category.name}</h2>
            {category.items.map(item => (
              <div key={item.id}>
                <h3 >{item.title}</h3>
                <ul>
                  {item.subItems.map(subItem => (
                    <li key={subItem.id}>
                      <span >{subItem.name}</span>
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
      errors: [{ messageId: 'keyOnlyOutermostElement' }],
      output: `
      {items.map((item) => {
        const Component = getComponentByType(item.type);
        return (
          <Component key={item.id}>
            <div >{item.content}</div>
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
      errors: [{ messageId: 'keyOnlyOutermostElement' }],
      output: `
      {isLoading
        ? <LoadingSpinner />
        : items.length === 0
          ? <EmptyState />
          : items.map((item) => (
              <div key={item.id} className="item">
                <header >
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
      errors: [{ messageId: 'fragmentShouldHaveKey' }],
      output: `
      {items.map((item) => (
        <>
          <div>{item.title}</div>
          <div>{item.description}</div>
        </>
      ))}
      `,
    },
  ],
});
