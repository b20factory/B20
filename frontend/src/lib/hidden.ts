// Tokens hidden from the public feed: early end-to-end test / dummy launches
// that predate the real board. New real launches are NOT affected, only these
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
    // Demo/showcase launches seeded during build — delisted from the public feed
    // (they stay verified on-chain, and remain as examples on the Security page).
    "0xb20000000000000000000077dD6AC09Dd515Bf22", // BBASE Beryl Base (Base demo)
    "0x43608F3288b6B9F5B090B1A5bA07d35536b94667", // BHOOD Beryl Hood (Robinhood curve demo)
    "0x697220D7ef4B35e30B8378B0C3D825E96287C08E", // BOTC  Bot Cat (Robinhood v3 demo)
  ].map((a) => a.toLowerCase())
);

export function isHidden(token: string): boolean {
  return HIDDEN.has(token.toLowerCase());
}
