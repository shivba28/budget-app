import type { PhantomUiAttributes } from '@aejkatappaja/phantom-ui'

export {}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'phantom-ui': PhantomUiAttributes
    }
  }
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'phantom-ui': PhantomUiAttributes
    }
  }
}
