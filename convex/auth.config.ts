/**
 * Dice a Convex di quale emittente fidarsi per i token di accesso: il deployment stesso.
 * CONVEX_SITE_URL e' impostata da Convex; non serve configurarla a mano.
 */
const authConfig = {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
