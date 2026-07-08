// Tokens hidden from the public feed: early end-to-end test / dummy launches
// that predate the real board. New real launches are NOT affected — only these
// exact addresses are filtered. Add an address here to delist it.
const HIDDEN = new Set(
  [
    "0xB200000000000000000000B719De426B27aeF287", // TKM  Token Mode (test)
    "0xb2000000000000000000003B0c6549871129f8A2", // TEST test
    "0xB200000000000000000000E163D0A5D7063f25Ee", // E2EA E2E Alpha
    "0xB2000000000000000000003203f33E68FA2E366E", // E2EB E2E Beta
    "0xB2000000000000000000000FE08541A4D677AfF2", // E2EA E2E Alpha
    "0xb200000000000000000000b88b88F38084f5FFDB", // E2EA E2E Alpha
    "0xb2000000000000000000001E0359842D588B7f3d", // E2EB E2E Beta
    "0xB200000000000000000000d8F4227aeDfbA03D86", // E2EA E2E Alpha
    "0xB20000000000000000000008c1B92C0F3D89922F", // E2EB E2E Beta
    "0xb2000000000000000000002b1096cb2472EB0879", // ODIST Owner Dist (test)
  ].map((a) => a.toLowerCase())
);

export function isHidden(token: string): boolean {
  return HIDDEN.has(token.toLowerCase());
}
