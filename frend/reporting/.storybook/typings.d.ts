declare module '*.md' {
  const content: string;
  export default content;
}

// custom-electron-titlebar exports ./dist as a sub-path but doesn't declare it
// in its package.json exports map — shim for Storybook (bundler moduleResolution).
declare module 'custom-electron-titlebar/dist' {}
