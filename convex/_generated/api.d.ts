/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as accessLinks from "../accessLinks.js";
import type * as admins from "../admins.js";
import type * as clients from "../clients.js";
import type * as crons from "../crons.js";
import type * as documents from "../documents.js";
import type * as health from "../health.js";
import type * as invoices from "../invoices.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_links from "../lib/links.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_validators from "../lib/validators.js";
import type * as maintenance from "../maintenance.js";
import type * as otp from "../otp.js";
import type * as portal from "../portal.js";
import type * as projects from "../projects.js";
import type * as subscriptions from "../subscriptions.js";

declare const fullApi: ApiFromModules<{
  accessLinks: typeof accessLinks;
  admins: typeof admins;
  clients: typeof clients;
  crons: typeof crons;
  documents: typeof documents;
  health: typeof health;
  invoices: typeof invoices;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/crypto": typeof lib_crypto;
  "lib/errors": typeof lib_errors;
  "lib/links": typeof lib_links;
  "lib/text": typeof lib_text;
  "lib/validators": typeof lib_validators;
  maintenance: typeof maintenance;
  otp: typeof otp;
  portal: typeof portal;
  projects: typeof projects;
  subscriptions: typeof subscriptions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
