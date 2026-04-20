declare module '*.module.scss' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.css' {
  const value: string;
  export default value;
}

declare module '*.scss' {
  const value: string;
  export default value;
}
