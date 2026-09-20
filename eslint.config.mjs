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
    // imagenes de Vercel consume cuota en la capa gratuita. Las imagenes
    // vienen de Cloudinary ya transformadas (f_auto,q_auto,w_*), asi que
    // <img> alcanza. Ver docs/decisiones.md.
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
