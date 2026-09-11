// src/services/billing/paymongoMockGateway.js
// Thin re-export: the PayMongo-shaped pure mock lives in gateway.js (same
// file avoids a circular import). Import from here or gateway.js — identical.
export {
  PayMongoMockGateway,
  toCentavos,
  fromCentavos,
  PAYMONGO_TYPES,
  paymongoTypeFor,
} from "./gateway.js";
