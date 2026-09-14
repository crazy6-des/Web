// Regression contract for CPAlead GET callbacks.
// The Worker normalizer must convert CPAlead GET query parameters into a POST/form request
// before handleRewards parses the payload. This prevents the generic "Invalid postback payload"
// response caused by Request.text() being empty on GET requests.
export const cpaleadGetRegression = {
  method: 'GET',
  path: '/api/cpal_postback',
  required: ['subid', 'lead_id', 'payout', 'password'],
  expectedInternalMethod: 'POST',
};
