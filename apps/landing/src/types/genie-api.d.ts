// The API is consumed as a pre-bundled ES module (apps/api/dist/vercel.mjs, built by turbo before
// this app) — it has no type declarations, so describe the one export we use.
declare module '@genie/api/vercel' {
  export const fetchHandler: (req: Request) => Response | Promise<Response>;
}
