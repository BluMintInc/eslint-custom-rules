import { ruleTesterJsx } from '../utils/ruleTester';
import { noInlineComponentProp } from '../rules/no-inline-component-prop';

ruleTesterJsx.run('no-inline-component-prop', noInlineComponentProp, {
	valid: [
		// Stable component reference passed
		{
			code: `
import { memo } from 'react';
const Wrapper = memo(function Wrapper(p: any){ return <div {...p}/> });
function Page(){
  return <AlgoliaLayout CatalogWrapper={Wrapper} />
}
`,
		},
		// Render prop allowed
		{
			code: `
function Row({ row }: any){ return <div>{row}</div> }
function Table(){
  return <Grid rows={[]} render={(row)=> <Row row={row} />} />
}
`,
			options: [{ allowRenderProps: true }],
		},
		// children allowed
		{
			code: `
function Comp(){
  return <Layout children={(x:any)=> <span>{x}</span>} />
}
`,
			options: [{ allowRenderProps: true }],
		},
		// Top-level factory allowed when configured
		{
			code: `
import { memo } from 'react';
const makeWrapper = () => memo(function W(p:any){ return <div {...p}/> });
const Stable = makeWrapper();
function Page(){
  return <AlgoliaLayout CatalogWrapper={Stable} />
}
`,
			options: [{ allowModuleScopeFactories: true }],
		},
		// Different prop name via config
		{
			code: `
const Good = (p:any)=> <div {...p}/>;
function Page(){
  return <Layout ItemComponent={Good} />
}
`,
			options: [{ props: ['ItemComponent'] }],
		},
		// Inline function to non-component prop is fine
		{
			code: `
function Page(){
  return <Layout onClick={() => {}} />
}
`,
		},
		// Identifier imported (assumed stable)
		{
			code: `
import { TeamsCarouselWrapper } from './wrappers';
function Teams(){
  return <AlgoliaLayout CatalogWrapper={TeamsCarouselWrapper} />
}
`,
		},
	],
	invalid: [
		// Inline arrow function
		{
			code: `
function Page(){
  return <AlgoliaLayout CatalogWrapper={(p:any)=> <div {...p}/> } />
}
`,
			errors: [{ messageId: 'noInlineComponentProp' }],
		},
		// Inline function expression
		{
			code: `
function Page(){
  return <AlgoliaLayout CatalogWrapper={function(p:any){ return <div {...p}/> }} />
}
`,
			errors: [{ messageId: 'noInlineComponentProp' }],
		},
		// Local const defined in render scope
		{
			code: `
function Page(){
  const Local = (p:any)=> <div {...p}/>;
  return <AlgoliaLayout CatalogWrapper={Local} />
}
`,
			errors: [{ messageId: 'noInlineComponentProp' }],
		},
		// useCallback in render
		{
			code: `
import { useCallback } from 'react';
function Page(){
  const Local = useCallback((p:any)=> <div {...p}/>, []);
  return <AlgoliaLayout CatalogWrapper={Local} />
}
`,
			errors: [{ messageId: 'noInlineComponentProp' }],
		},
		// useMemo returning function
		{
			code: `
import { useMemo } from 'react';
function Page(){
  const Local = useMemo(()=> (p:any)=> <div {...p}/>, []);
  return <AlgoliaLayout CatalogWrapper={Local} />
}
`,
			errors: [{ messageId: 'noInlineComponentProp' }],
		},
		// Passing inline wrapper in another component
		{
			code: `
function ContentVerticalCarouselGrid({ header, ...gridProps }: any){
  const CatalogWrapper = (props:any)=> <ContentCarouselWrapper {...props} {...gridProps} header={header} />;
  return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />
}
`,
			errors: [{ messageId: 'noInlineComponentProp' }],
		},
		// Capitalized local component defined inside render
		{
			code: `
function Teams(){
  const TeamsCatalogWrapper = (p:any)=> <div {...p}/>;
  return <AlgoliaLayout CatalogWrapper={TeamsCatalogWrapper} />
}
`,
			errors: [{ messageId: 'noInlineComponentProp' }],
		},
		// Configured prop pattern *Component
		{
			code: `
function Page(){
  const X = (p:any)=> <div {...p}/>;
  return <Layout ItemComponent={X} />
}
`,
			options: [{ props: ['*Component'] }],
			errors: [{ messageId: 'noInlineComponentProp' }],
		},
		// Should not be mistaken for render prop when allowRenderProps=true but prop matches configured
		{
			code: `
function Page(){
  return <Layout CatalogWrapper={(p:any)=> <div {...p}/>} />
}
`,
			options: [{ allowRenderProps: true }],
			errors: [{ messageId: 'noInlineComponentProp' }],
		},
	],
});