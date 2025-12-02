/// <reference types="vite/client" />

declare module '*.md' {
  const content: string;
  export default content;
} 

declare module '*.txt' {
  const content: string;
  export default content;
} 

declare module '@bull-board/hono' {
  export { HonoAdapter } from '@bull-board/hono/dist/HonoAdapter'
}