export interface TenantTema {
  colorPrimario: string;
  colorSecundario: string;
  colorFondo: string;
  colorTexto: string;
  colorLinks: string;
}

export const DEFAULT_TEMA: TenantTema = {
  colorPrimario: "#000000",
  colorSecundario: "#000000",
  colorFondo: "#ffffff",
  colorTexto: "#000000",
  colorLinks: "#000000",
};

export const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

export function isValidHex(value: string): boolean {
  return HEX_REGEX.test(value);
}
