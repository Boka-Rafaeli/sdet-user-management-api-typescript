import { isIP } from 'node:net';
import { domainToUnicode } from 'node:url';

/** Generated-oracle compatibility is separate from Python FormatChecker's loose email rule.
 * Verified against jsonschema_rs 0.51.0 (Schemathesis 4.25.2), including its default
 * display-name and UTF-8 local-part behavior; see the committed golden corpus.
 */
export function generatedEmailValid(value: string): boolean {
  let address = value;
  const displaySeparator = address.lastIndexOf(' <');
  if (displaySeparator !== -1) {
    const rest = address.slice(displaySeparator + 2).trim();
    if (!rest.endsWith('>')) return false;
    address = rest.slice(0, -1);
  }
  const separator = address.lastIndexOf('@');
  if (separator <= 0) return false;
  const local = address.slice(0, separator);
  const domain = address.slice(separator + 1);
  if (Buffer.byteLength(local, 'utf8') > 64 || local.length === 0) return false;
  if (local.startsWith('"') && local.endsWith('"')) {
    const characters = [...local.slice(1, -1)];
    if (characters.length === 0) return false;
    for (let index = 0; index < characters.length; index += 1) {
      const character = characters[index]!;
      if (character === '\\') {
        const escaped = characters[++index];
        if (!escaped || escaped.codePointAt(0)! < 0x21 || escaped.codePointAt(0)! > 0x7e)
          return false;
      } else {
        const code = character.codePointAt(0)!;
        if (!(
          character === ' ' ||
          character === '\t' ||
          code === 0x21 ||
          (code >= 0x23 && code <= 0x5b) ||
          (code >= 0x5d && code <= 0x7e) ||
          legacyUtf8Character(character)
        ))
          return false;
      }
    }
  } else {
    if (
      !local
        .split('.')
        .every(
          (atom) =>
            atom.length > 0 &&
            [...atom].every(
              (character) =>
                /[\p{Alphabetic}\p{Number}]/u.test(character) ||
                "!#$%&'*+-/=?^_`{|}~".includes(character) ||
                legacyUtf8Character(character),
            ),
        )
    )
      return false;
  }
  if (domain.startsWith('[') && domain.endsWith(']')) {
    const literal = domain.slice(1, -1);
    return literal.startsWith('IPv6:') ? isIP(literal.slice(5)) === 6 : isIP(literal) === 4;
  }
  if (domain.length === 0 || domain.length > 253 || !/^[A-Za-z0-9.-]+$/.test(domain)) return false;
  return domain.split('.').every((label) => {
    if (label.length === 0 || label.length > 63 || label.startsWith('-') || label.endsWith('-'))
      return false;
    if (label.slice(2, 4) === '--' && !label.startsWith('xn--')) return false;
    if (!label.startsWith('xn--')) return true;
    const decoded = domainToUnicode(label);
    return decoded.length > 0 && decoded !== label && validUnicodeLabel(decoded);
  });
}

// email_address 0.2.9's legacy non-ASCII predicate is based on code-point bytes.
function legacyUtf8Character(character: string): boolean {
  const code = character.codePointAt(0)!;
  return (
    code >>> 8 >= 0xc2 &&
    code >>> 8 <= 0xdf &&
    (code & 0xff) >= 0x80 &&
    (code & 0xff) <= 0xbf &&
    !(code >= 0xd800 && code <= 0xdfff)
  );
}

function validUnicodeLabel(label: string): boolean {
  const characters = [...label];
  if (/\p{Mark}/u.test(characters[0] ?? '')) return false;
  let katakanaDot = false;
  let japanese = false;
  let arabic = false;
  let extendedArabic = false;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]!;
    const code = character.codePointAt(0)!;
    const previous = characters[index - 1] ?? '';
    const next = characters[index + 1] ?? '';
    if (character === '·' && (previous !== 'l' || next !== 'l')) return false;
    if (code === 0x0375 && !/[\u0370-\u03ff]/u.test(next)) return false;
    if ([0x05f3, 0x05f4].includes(code) && !/[\u0590-\u05ff]/u.test(previous)) return false;
    if (code === 0x30fb) {
      katakanaDot = true;
      continue;
    }
    if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/u.test(character)) {
      japanese = true;
      continue;
    }
    if (code >= 0x0660 && code <= 0x0669) arabic = true;
    if (code >= 0x06f0 && code <= 0x06f9) extendedArabic = true;
    if (
      [0x0640, 0x07fa, 0x302e, 0x302f, 0x3031, 0x3032, 0x3033, 0x3034, 0x3035, 0x303b].includes(
        code,
      )
    )
      return false;
    // UTS46 conversion above enforces contextual joiners before this category check.
    if (
      [0x200c, 0x200d, 0x00b7, 0x0375, 0x05f3, 0x05f4, 0x06fd, 0x06fe, 0x0f0b, 0x3007].includes(
        code,
      )
    )
      continue;
    if (
      code > 127 &&
      !/[\p{Letter}\p{Nonspacing_Mark}\p{Spacing_Mark}\p{Decimal_Number}]/u.test(character)
    )
      return false;
  }
  return !((katakanaDot && !japanese) || (arabic && extendedArabic));
}
