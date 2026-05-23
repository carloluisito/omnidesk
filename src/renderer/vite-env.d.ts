/// <reference types="vite/client" />

// Vite handles SVG imports as URL strings by default. Without this, the
// TypeScript compiler can't resolve `import x from './foo.svg'`.
declare module '*.svg' {
  const url: string;
  export default url;
}
