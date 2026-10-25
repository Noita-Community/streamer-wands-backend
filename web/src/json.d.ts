// The game data files are megabytes of sprites and stats. Letting TypeScript infer a literal
// type for each would be slow and useless, so JSON imports are typed as unknown here and given
// their real types once, in data.ts.
declare module '*.json' {
    const value: unknown;
    export default value;
}
