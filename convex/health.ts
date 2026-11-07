import { internalMutation } from "./_generated/server";
import { isWellFormedToken, randomDigits, randomToken, sha256Hex } from "./lib/crypto";

/**
 * Prova di fumo della crittografia NEL runtime reale di Convex (i test locali usano un altro runtime).
 * Si lancia una volta dopo il primo deploy:
 *   npx convex run health:cryptoSelfTest
 * Tutti i valori devono essere `true`.
 */
export const cryptoSelfTest = internalMutation({
  args: {},
  handler: async () => {
    const a = randomToken();
    const b = randomToken();
    const digits = randomDigits(6);
    return {
      tokenIsWellFormed: isWellFormedToken(a),
      tokensAreDifferent: a !== b,
      digitsAreSixNumbers: /^[0-9]{6}$/.test(digits),
      // SHA-256("abc"), vettore di prova standard.
      sha256Works:
        (await sha256Hex("abc")) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    };
  },
});
