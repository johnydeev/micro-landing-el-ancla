import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Decision del proyecto: no usar `next/image` porque el optimizador de
    // imagenes de Vercel consume cuota en la capa gratuita. El logo es un
    // asset chico y las imagenes de oferta son PNGs servidos desde /public,
    // ya optimizados manualmente por el cliente. Ver
    // docs/decisiones.md ("Mantener <img> en vez de next/image").
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
