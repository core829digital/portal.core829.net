import type { MetadataRoute } from "next";

// Il portale e' privato: nessuna pagina deve comparire nei motori di ricerca.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
