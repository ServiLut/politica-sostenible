/**
 * Utilidades para validación de estándares colombianos.
 */
export class ColombiaValidator {
  /**
   * Calcula el dígito de verificación de un NIT en Colombia.
   */
  static calculateNITCheckDigit(nit: string): number {
    const vpri = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    const x = nit.length;
    let y = 0;
    let z = 0;

    for (let i = 0; i < x; i++) {
      y = parseInt(nit.substr(i, 1));
      z += y * vpri[x - i - 1];
    }

    y = z % 11;
    if (y > 1) {
      return 11 - y;
    } else {
      return y;
    }
  }

  /**
   * Valida si un NIT con dígito de verificación es correcto (formato: NIT-DV).
   */
  static isValidNIT(nitWithDV: string): boolean {
    const parts = nitWithDV.split('-');
    if (parts.length !== 2) return false;
    const nit = parts[0];
    const dv = parseInt(parts[1]);
    return this.calculateNITCheckDigit(nit) === dv;
  }
}
