import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Rotte di Convex Auth (metadati OIDC e JWKS usati per verificare i token).
auth.addHttpRoutes(http);

export default http;
