// Regression contract: external CPAGrip offer IDs must not be written into internal offer_id FK columns.
// The provider attribution remains available through provider + event_id; internal offer_id is reserved for app-owned offers.
export const cpagripExternalOfferRegression = {
  provider: 'cpagrip',
  externalOfferId: 'directcpi-real-test-004',
  internalOfferId: undefined,
};
