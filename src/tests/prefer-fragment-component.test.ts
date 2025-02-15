import { ruleTesterJsx } from '../utils/ruleTester';
import { preferFragmentComponent } from '../rules/prefer-fragment-component';

ruleTesterJsx.run('prefer-fragment-component', preferFragmentComponent, {
  valid: [
    {
      code: `
        import { Fragment } from 'react';
        const Component = () => <Fragment>Hello World</Fragment>;
      `,
    },
    {
      code: `
        import { Fragment } from 'react';
        const Component = () => <Fragment><ChildComponent /></Fragment>;
      `,
    },
  ],
  invalid: [
    {
      code: `
        const Component = () => <>Hello World</>;
      `,
      errors: [{ messageId: 'preferFragment' }],
      output: `
        import { Fragment } from 'react';
        const Component = () => <Fragment>Hello World</Fragment>;
      `,
    },
    {
      code: `
        import React from 'react';
        const Component = () => <React.Fragment>Hello World</React.Fragment>;
      `,
      errors: [{ messageId: 'preferFragment' }],
      output: `
        import React, { Fragment } from 'react';
        const Component = () => <Fragment>Hello World</Fragment>;
      `,
    },
    {
      code: `
        import { useState } from 'react';
        const Component = () => <>Hello World</>;
      `,
      errors: [{ messageId: 'preferFragment' }],
      output: `
        import { useState, Fragment } from 'react';
        const Component = () => <Fragment>Hello World</Fragment>;
      `,
    },
    {
      code: `
        const Component = () => (
          <>
            <React.Fragment>
              <ChildComponent />
            </React.Fragment>
          </>
        );
      `,
      errors: [
        { messageId: 'preferFragment' },
        { messageId: 'preferFragment' },
      ],
      output: `
        import { Fragment } from 'react';
        const Component = () => (
          <Fragment>
            <Fragment>
              <ChildComponent />
            </Fragment>
          </Fragment>
        );
      `,
    },
  ],
});
