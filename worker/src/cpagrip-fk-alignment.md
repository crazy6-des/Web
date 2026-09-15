# CPAGrip offer ID schema boundary

CPAGrip `offer_id` is a provider-owned external identifier. The existing `offer_id` database fields are reserved for app-owned offer records and may be foreign-key constrained in production D1.

CPAGrip credits therefore keep the provider and conversion event identity while leaving the internal `offer_id` columns unset. This avoids rejecting otherwise valid reward credits because an external provider ID is not an internal offer record.
