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
import type * as auth from "../auth.js";
import type * as b2b from "../b2b.js";
import type * as clients from "../clients.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as docStudio from "../docStudio.js";
import type * as docStudioActions from "../docStudioActions.js";
import type * as documentScan from "../documentScan.js";
import type * as documents from "../documents.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as invoices from "../invoices.js";
import type * as lib_adminEmails from "../lib/adminEmails.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_autofill from "../lib/autofill.js";
import type * as lib_cors from "../lib/cors.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_docFields from "../lib/docFields.js";
import type * as lib_docPdf from "../lib/docPdf.js";
import type * as lib_docx from "../lib/docx.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_files from "../lib/files.js";
import type * as lib_hashReputation from "../lib/hashReputation.js";
import type * as lib_invoiceFlow from "../lib/invoiceFlow.js";
import type * as lib_ipAllowlist from "../lib/ipAllowlist.js";
import type * as lib_links from "../lib/links.js";
import type * as lib_logoPng from "../lib/logoPng.js";
import type * as lib_metrics from "../lib/metrics.js";
import type * as lib_otpLimits from "../lib/otpLimits.js";
import type * as lib_overview from "../lib/overview.js";
import type * as lib_pdfAnnotations from "../lib/pdfAnnotations.js";
import type * as lib_pdfAutofill from "../lib/pdfAutofill.js";
import type * as lib_pdfStamp from "../lib/pdfStamp.js";
import type * as lib_reminders from "../lib/reminders.js";
import type * as lib_resend from "../lib/resend.js";
import type * as lib_sheets from "../lib/sheets.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_webhookSignature from "../lib/webhookSignature.js";
import type * as lib_widgets from "../lib/widgets.js";
import type * as maintenance from "../maintenance.js";
import type * as otp from "../otp.js";
import type * as otpDelivery from "../otpDelivery.js";
import type * as pages from "../pages.js";
import type * as portal from "../portal.js";
import type * as projects from "../projects.js";
import type * as reminders from "../reminders.js";
import type * as subscriptions from "../subscriptions.js";
import type * as webhooks from "../webhooks.js";

declare const fullApi: ApiFromModules<{
  accessLinks: typeof accessLinks;
  admins: typeof admins;
  auth: typeof auth;
  b2b: typeof b2b;
  clients: typeof clients;
  crons: typeof crons;
  dashboard: typeof dashboard;
  docStudio: typeof docStudio;
  docStudioActions: typeof docStudioActions;
  documentScan: typeof documentScan;
  documents: typeof documents;
  health: typeof health;
  http: typeof http;
  invoices: typeof invoices;
  "lib/adminEmails": typeof lib_adminEmails;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/autofill": typeof lib_autofill;
  "lib/cors": typeof lib_cors;
  "lib/crypto": typeof lib_crypto;
  "lib/docFields": typeof lib_docFields;
  "lib/docPdf": typeof lib_docPdf;
  "lib/docx": typeof lib_docx;
  "lib/errors": typeof lib_errors;
  "lib/files": typeof lib_files;
  "lib/hashReputation": typeof lib_hashReputation;
  "lib/invoiceFlow": typeof lib_invoiceFlow;
  "lib/ipAllowlist": typeof lib_ipAllowlist;
  "lib/links": typeof lib_links;
  "lib/logoPng": typeof lib_logoPng;
  "lib/metrics": typeof lib_metrics;
  "lib/otpLimits": typeof lib_otpLimits;
  "lib/overview": typeof lib_overview;
  "lib/pdfAnnotations": typeof lib_pdfAnnotations;
  "lib/pdfAutofill": typeof lib_pdfAutofill;
  "lib/pdfStamp": typeof lib_pdfStamp;
  "lib/reminders": typeof lib_reminders;
  "lib/resend": typeof lib_resend;
  "lib/sheets": typeof lib_sheets;
  "lib/text": typeof lib_text;
  "lib/validators": typeof lib_validators;
  "lib/webhookSignature": typeof lib_webhookSignature;
  "lib/widgets": typeof lib_widgets;
  maintenance: typeof maintenance;
  otp: typeof otp;
  otpDelivery: typeof otpDelivery;
  pages: typeof pages;
  portal: typeof portal;
  projects: typeof projects;
  reminders: typeof reminders;
  subscriptions: typeof subscriptions;
  webhooks: typeof webhooks;
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
